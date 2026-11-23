"""Pluggable ground routing provider (OSRM + Haversine fallback) and route caching."""

import asyncio
from dataclasses import dataclass
from typing import Protocol

import httpx
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.constants import (
    METERS_PER_KM,
    ROUTING_HTTP_TIMEOUT_SEC,
    SECONDS_PER_MINUTE,
)
from app.models import DayOption, ItemType, ItineraryItem, RouteProfile, RouteSegment
from app.services.airport_service import haversine_km

GROUND_ANCHOR_TYPES: frozenset[str] = frozenset(
    {
        ItemType.SPOT.value,
        ItemType.FOOD.value,
        ItemType.STAY.value,
        ItemType.RESERVED_TRANSIT.value,
    }
)


@dataclass(frozen=True)
class RouteLegResult:
    """Computed ground leg between two coordinates."""

    distance_km: float
    duration_min: int | None
    geometry_polyline: str | None
    is_approx: bool


class RoutingProvider(Protocol):
    """Protocol for ground routing backends (OSRM, Valhalla, Google Routes, etc.)."""

    async def compute_leg(
        self,
        lat1: float,
        lng1: float,
        lat2: float,
        lng2: float,
        profile: RouteProfile = RouteProfile.DRIVING,
    ) -> RouteLegResult: ...


class HaversineRoutingProvider:
    """Offline fallback provider returning straight-line Haversine distance."""

    async def compute_leg(
        self,
        lat1: float,
        lng1: float,
        lat2: float,
        lng2: float,
        profile: RouteProfile = RouteProfile.DRIVING,
    ) -> RouteLegResult:
        del profile
        return RouteLegResult(
            distance_km=haversine_km(lat1, lng1, lat2, lng2),
            duration_min=None,
            geometry_polyline=None,
            is_approx=True,
        )


class OsrmRoutingProvider:
    """OSRM HTTP routing provider with shared client and Haversine fallback."""

    def __init__(
        self,
        base_url: str | None = None,
        timeout_sec: float = ROUTING_HTTP_TIMEOUT_SEC,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self.base_url = (base_url or get_settings().osrm_base_url).rstrip("/")
        self.timeout_sec = timeout_sec
        self._client = client

    async def compute_leg(
        self,
        lat1: float,
        lng1: float,
        lat2: float,
        lng2: float,
        profile: RouteProfile = RouteProfile.DRIVING,
    ) -> RouteLegResult:
        osrm_profile = (
            "foot"
            if profile == RouteProfile.FOOT
            else "cycling"
            if profile == RouteProfile.CYCLING
            else "driving"
        )
        url = (
            f"{self.base_url}/route/v1/{osrm_profile}/"
            f"{lng1},{lat1};{lng2},{lat2}"
        )
        try:
            if self._client is not None:
                response = await self._client.get(
                    url,
                    params={"overview": "simplified", "geometries": "polyline"},
                )
            else:
                async with httpx.AsyncClient(timeout=self.timeout_sec) as client:
                    response = await client.get(
                        url,
                        params={"overview": "simplified", "geometries": "polyline"},
                    )
            if response.status_code == 200:
                data = response.json()
                routes = data.get("routes") or []
                if routes:
                    best = routes[0]
                    distance_km = round(float(best["distance"]) / METERS_PER_KM, 2)
                    duration_min = max(
                        1, round(float(best["duration"]) / SECONDS_PER_MINUTE)
                    )
                    return RouteLegResult(
                        distance_km=distance_km,
                        duration_min=duration_min,
                        geometry_polyline=best.get("geometry"),
                        is_approx=False,
                    )
        except Exception:
            # Fall back to Haversine so offline/ferry/timeout cases never block writes.
            pass

        return RouteLegResult(
            distance_km=haversine_km(lat1, lng1, lat2, lng2),
            duration_min=None,
            geometry_polyline=None,
            is_approx=True,
        )


async def recalculate_option_routes(
    db: AsyncSession,
    option: DayOption,
    items: list[ItineraryItem],
    provider: RoutingProvider | None = None,
) -> tuple[float, bool]:
    """Recompute and cache RouteSegment rows concurrently for geolocated stops."""
    await db.execute(
        delete(RouteSegment).where(RouteSegment.day_option_id == option.id)
    )

    geolocated = [
        item
        for item in sorted(items, key=lambda i: i.sort_order)
        if item.is_selected
        and item.type in GROUND_ANCHOR_TYPES
        and item.latitude is not None
        and item.longitude is not None
    ]

    pairs = list(zip(geolocated, geolocated[1:], strict=False))
    if not pairs:
        option.cached_ground_distance_km = 0.0
        option.cached_distance_is_approx = False
        return 0.0, False

    if provider is not None:
        legs = await asyncio.gather(
            *[
                provider.compute_leg(
                    prev_item.latitude,  # type: ignore[arg-type]
                    prev_item.longitude,  # type: ignore[arg-type]
                    next_item.latitude,  # type: ignore[arg-type]
                    next_item.longitude,  # type: ignore[arg-type]
                    RouteProfile.DRIVING,
                )
                for prev_item, next_item in pairs
            ]
        )
    else:
        # Share a single connection pool across all legs in the day option.
        async with httpx.AsyncClient(timeout=ROUTING_HTTP_TIMEOUT_SEC) as shared_client:
            osrm = OsrmRoutingProvider(client=shared_client)
            legs = await asyncio.gather(
                *[
                    osrm.compute_leg(
                        prev_item.latitude,  # type: ignore[arg-type]
                        prev_item.longitude,  # type: ignore[arg-type]
                        next_item.latitude,  # type: ignore[arg-type]
                        next_item.longitude,  # type: ignore[arg-type]
                        RouteProfile.DRIVING,
                    )
                    for prev_item, next_item in pairs
                ]
            )

    total_km = 0.0
    any_approx = False

    for (prev_item, next_item), leg in zip(pairs, legs, strict=True):
        total_km += leg.distance_km
        any_approx = any_approx or leg.is_approx
        db.add(
            RouteSegment(
                day_option_id=option.id,
                from_item_id=prev_item.id,
                to_item_id=next_item.id,
                profile=RouteProfile.DRIVING.value,
                distance_km=leg.distance_km,
                duration_min=leg.duration_min,
                geometry_polyline=leg.geometry_polyline,
                is_approx=leg.is_approx,
            )
        )

    option.cached_ground_distance_km = round(total_km, 2)
    option.cached_distance_is_approx = any_approx
    return option.cached_ground_distance_km, option.cached_distance_is_approx
