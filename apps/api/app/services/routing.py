"""Pluggable ground routing provider (OSRM + Haversine fallback) and route caching."""

import asyncio
from dataclasses import dataclass
from typing import Protocol

import httpx
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.constants import (
    MAX_AIRPORT_GROUND_LEG_KM,
    METERS_PER_KM,
    ROUTING_HTTP_TIMEOUT_SEC,
    SECONDS_PER_MINUTE,
)
from app.core.http_client import get_shared_http_client, request_with_resilience
from app.models import DayOption, ItemType, ItineraryItem, RouteProfile, RouteSegment
from app.services.airport_service import haversine_km, infer_flight_airport_role

GROUND_ANCHOR_TYPES: frozenset[str] = frozenset(
    {
        ItemType.SPOT.value,
        ItemType.FOOD.value,
        ItemType.STAY.value,
        ItemType.RESERVED_TRANSIT.value,
        ItemType.FLIGHT.value,
    }
)
COORDINATE_EPSILON = 1e-5


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
        client = self._client or get_shared_http_client()
        try:
            response = await request_with_resilience(
                "osrm",
                "GET",
                url,
                client=client,
                params={"overview": "simplified", "geometries": "polyline"},
                timeout=self.timeout_sec,
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


def build_day_ground_pairs(
    items: list[ItineraryItem],
    departure_stay: ItineraryItem | None = None,
) -> list[tuple[ItineraryItem, ItineraryItem]]:
    """Build ordered ground transfer pairs across stays, airports, and daily stops."""
    ordered = [
        item
        for item in sorted(items, key=lambda i: i.sort_order)
        if item.is_selected and item.latitude is not None and item.longitude is not None
    ]
    stops = [i for i in ordered if i.type in GROUND_ANCHOR_TYPES]
    explicit_stays = [i for i in ordered if i.type == ItemType.STAY.value]
    arrival_stay = explicit_stays[-1] if explicit_stays else departure_stay

    def _flight_role(item: ItineraryItem, idx_in_stops: int | None) -> str:
        raw_details = item.details if isinstance(item.details, dict) else {}
        explicit = raw_details.get("airport_role")
        if explicit in ("ARRIVAL", "DEPARTURE"):
            return str(explicit)
        inferred = infer_flight_airport_role(
            raw_details, item.latitude, item.longitude
        )
        if inferred is not None:
            return inferred

        # Fall back to positional direction when airport IATA metadata is absent.
        if (
            idx_in_stops is not None
            and item.latitude is not None
            and item.longitude is not None
        ):
            if idx_in_stops + 1 < len(stops):
                nxt = stops[idx_in_stops + 1]
                if (
                    nxt.type != ItemType.FLIGHT.value
                    and nxt.latitude is not None
                    and nxt.longitude is not None
                    and haversine_km(
                        item.latitude, item.longitude, nxt.latitude, nxt.longitude
                    )
                    <= MAX_AIRPORT_GROUND_LEG_KM
                ):
                    return "ARRIVAL"
            if idx_in_stops > 0:
                prv = stops[idx_in_stops - 1]
                if (
                    prv.type != ItemType.FLIGHT.value
                    and prv.latitude is not None
                    and prv.longitude is not None
                    and haversine_km(
                        prv.latitude, prv.longitude, item.latitude, item.longitude
                    )
                    <= MAX_AIRPORT_GROUND_LEG_KM
                ):
                    return "DEPARTURE"

        if explicit_stays:
            return "ARRIVAL"
        if departure_stay is not None:
            return "DEPARTURE"
        return "ARRIVAL"

    def _valid_leg(
        a: ItineraryItem,
        b: ItineraryItem,
        a_idx: int | None,
        b_idx: int | None,
    ) -> bool:
        if (
            a.id == b.id
            or a.latitude is None
            or a.longitude is None
            or b.latitude is None
            or b.longitude is None
        ):
            return False
        if (
            abs(a.latitude - b.latitude) < COORDINATE_EPSILON
            and abs(a.longitude - b.longitude) < COORDINATE_EPSILON
        ):
            return False
        if a.type == ItemType.FLIGHT.value and b.type == ItemType.FLIGHT.value:
            return False
        if a.type == ItemType.FLIGHT.value:
            if _flight_role(a, a_idx) == "DEPARTURE":
                return False
            if (
                haversine_km(a.latitude, a.longitude, b.latitude, b.longitude)
                > MAX_AIRPORT_GROUND_LEG_KM
            ):
                return False
        if b.type == ItemType.FLIGHT.value:
            if _flight_role(b, b_idx) == "ARRIVAL":
                return False
            if (
                haversine_km(a.latitude, a.longitude, b.latitude, b.longitude)
                > MAX_AIRPORT_GROUND_LEG_KM
            ):
                return False
        return True

    pairs: list[tuple[ItineraryItem, ItineraryItem]] = []
    seen_pairs: set[tuple[str, str]] = set()

    def _add_pair(a: ItineraryItem, b: ItineraryItem) -> None:
        key = (a.id, b.id)
        if key not in seen_pairs:
            seen_pairs.add(key)
            pairs.append((a, b))

    if stops:
        if (
            departure_stay is not None
            and _valid_leg(departure_stay, stops[0], None, 0)
        ):
            _add_pair(departure_stay, stops[0])
        for idx in range(len(stops) - 1):
            nxt = stops[idx + 1]
            if _valid_leg(stops[idx], nxt, idx, idx + 1):
                _add_pair(stops[idx], nxt)
        last_idx = len(stops) - 1
        if (
            arrival_stay is not None
            and _valid_leg(stops[last_idx], arrival_stay, last_idx, None)
        ):
            _add_pair(stops[last_idx], arrival_stay)
    elif (
        departure_stay is not None
        and arrival_stay is not None
        and _valid_leg(departure_stay, arrival_stay, None, None)
    ):
        _add_pair(departure_stay, arrival_stay)

    return pairs


async def recalculate_option_routes(
    db: AsyncSession,
    option: DayOption,
    items: list[ItineraryItem],
    provider: RoutingProvider | None = None,
    departure_stay: ItineraryItem | None = None,
    *,
    invalidate_item_ids: set[str] | None = None,
    force_refresh: bool = False,
) -> tuple[float, bool]:
    """Recompute and cache RouteSegment rows concurrently for geolocated stops."""
    reusable: dict[tuple[str, str], RouteLegResult] = {}
    if not force_refresh:
        invalid = invalidate_item_ids or set()
        for seg in option.route_segments:
            if (
                not seg.is_approx
                and seg.from_item_id not in invalid
                and seg.to_item_id not in invalid
            ):
                reusable[(seg.from_item_id, seg.to_item_id)] = RouteLegResult(
                    distance_km=seg.distance_km,
                    duration_min=seg.duration_min,
                    geometry_polyline=seg.geometry_polyline,
                    is_approx=seg.is_approx,
                )

    await db.execute(
        delete(RouteSegment).where(RouteSegment.day_option_id == option.id)
    )

    pairs = build_day_ground_pairs(items, departure_stay=departure_stay)
    if not pairs:
        option.cached_ground_distance_km = 0.0
        option.cached_distance_is_approx = False
        return 0.0, False

    missing_indices = [
        idx
        for idx, (prev_item, next_item) in enumerate(pairs)
        if (prev_item.id, next_item.id) not in reusable
    ]
    computed_by_idx: dict[int, RouteLegResult] = {}
    if missing_indices:
        active_provider: RoutingProvider = (
            provider
            if provider is not None
            else OsrmRoutingProvider(client=get_shared_http_client())
        )
        computed = await asyncio.gather(
            *[
                active_provider.compute_leg(
                    pairs[idx][0].latitude,  # type: ignore[arg-type]
                    pairs[idx][0].longitude,  # type: ignore[arg-type]
                    pairs[idx][1].latitude,  # type: ignore[arg-type]
                    pairs[idx][1].longitude,  # type: ignore[arg-type]
                    RouteProfile.DRIVING,
                )
                for idx in missing_indices
            ]
        )
        computed_by_idx = dict(zip(missing_indices, computed, strict=True))

    total_km = 0.0
    any_approx = False

    for idx, (prev_item, next_item) in enumerate(pairs):
        leg = computed_by_idx.get(idx) or reusable[(prev_item.id, next_item.id)]
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
