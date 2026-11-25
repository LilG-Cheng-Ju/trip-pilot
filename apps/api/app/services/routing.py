"""Pluggable ground routing provider (OSRM + Haversine fallback) and route caching."""

import asyncio
import logging
from dataclasses import dataclass
from typing import Protocol

import httpx
from sqlalchemy import delete, select
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
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class RouteLegResult:
    """Computed ground leg between two coordinates."""

    distance_km: float
    duration_min: int | None
    geometry_polyline: str | None
    is_approx: bool


@dataclass(frozen=True)
class PlannedLegSpec:
    """Detached coordinate leg spec allowing OSRM calls outside DB transactions."""

    from_item_id: str
    to_item_id: str
    lat1: float
    lng1: float
    lat2: float
    lng2: float
    profile: RouteProfile = RouteProfile.DRIVING

    @property
    def coord_key(self) -> tuple[float, float, float, float, RouteProfile]:
        return (self.lat1, self.lng1, self.lat2, self.lng2, self.profile)


@dataclass(frozen=True)
class OptionRoutePlan:
    """Pure-Python route recalculation plan for a single DayOption."""

    option_id: str
    leg_specs: list[PlannedLegSpec]
    reusable: dict[tuple[str, str], RouteLegResult]


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
        except Exception as exc:
            # Fall back to Haversine so offline/ferry/timeout cases never block writes.
            logger.warning(
                "OSRM routing failed, falling back to Haversine: %s",
                type(exc).__name__,
            )

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


def build_option_route_plan(
    option: DayOption,
    items: list[ItineraryItem],
    departure_stay: ItineraryItem | None = None,
    *,
    invalidate_item_ids: set[str] | None = None,
    force_refresh: bool = False,
) -> OptionRoutePlan:
    """Extract reusable route legs and detached specs without holding DB locks."""
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

    pairs = build_day_ground_pairs(items, departure_stay=departure_stay)
    leg_specs: list[PlannedLegSpec] = []
    for prev_item, next_item in pairs:
        if (
            prev_item.latitude is None
            or prev_item.longitude is None
            or next_item.latitude is None
            or next_item.longitude is None
        ):
            continue
        leg_specs.append(
            PlannedLegSpec(
                from_item_id=prev_item.id,
                to_item_id=next_item.id,
                lat1=prev_item.latitude,
                lng1=prev_item.longitude,
                lat2=next_item.latitude,
                lng2=next_item.longitude,
                profile=RouteProfile.DRIVING,
            )
        )
    return OptionRoutePlan(
        option_id=option.id,
        leg_specs=leg_specs,
        reusable=reusable,
    )


async def compute_missing_route_legs(
    plans: list[OptionRoutePlan],
    provider: RoutingProvider | None = None,
) -> dict[tuple[float, float, float, float, RouteProfile], RouteLegResult]:
    """Resolve uncached ground route legs concurrently with no DB lock held."""
    missing_keys: list[tuple[float, float, float, float, RouteProfile]] = []
    seen: set[tuple[float, float, float, float, RouteProfile]] = set()
    for plan in plans:
        for spec in plan.leg_specs:
            if (spec.from_item_id, spec.to_item_id) in plan.reusable:
                continue
            key = spec.coord_key
            if key not in seen:
                seen.add(key)
                missing_keys.append(key)

    if not missing_keys:
        return {}

    active_provider: RoutingProvider = (
        provider
        if provider is not None
        else OsrmRoutingProvider(client=get_shared_http_client())
    )
    computed = await asyncio.gather(
        *(active_provider.compute_leg(*key) for key in missing_keys)
    )
    return dict(zip(missing_keys, computed, strict=True))


async def apply_option_route_plan(
    db: AsyncSession,
    option: DayOption,
    plan: OptionRoutePlan,
    computed_legs: dict[
        tuple[float, float, float, float, RouteProfile], RouteLegResult
    ],
    *,
    existing_item_ids: set[str] | None = None,
) -> tuple[float, bool]:
    """Persist precomputed RouteSegment rows inside a short DB transaction."""
    await db.execute(
        delete(RouteSegment).where(RouteSegment.day_option_id == option.id)
    )

    if not plan.leg_specs:
        option.cached_ground_distance_km = 0.0
        option.cached_distance_is_approx = False
        return 0.0, False

    valid_ids = existing_item_ids
    if valid_ids is None:
        referenced_ids = {
            item_id
            for spec in plan.leg_specs
            for item_id in (spec.from_item_id, spec.to_item_id)
        }
        valid_ids = set(
            (
                await db.scalars(
                    select(ItineraryItem.id).where(ItineraryItem.id.in_(referenced_ids))
                )
            ).all()
        )

    total_km = 0.0
    any_approx = False
    for spec in plan.leg_specs:
        if spec.from_item_id not in valid_ids or spec.to_item_id not in valid_ids:
            # Skip legs whose endpoint item was concurrently deleted during network I/O.
            continue
        leg = plan.reusable.get((spec.from_item_id, spec.to_item_id))
        if leg is None:
            leg = computed_legs[spec.coord_key]
        total_km += leg.distance_km
        any_approx = any_approx or leg.is_approx
        db.add(
            RouteSegment(
                day_option_id=option.id,
                from_item_id=spec.from_item_id,
                to_item_id=spec.to_item_id,
                profile=spec.profile.value,
                distance_km=leg.distance_km,
                duration_min=leg.duration_min,
                geometry_polyline=leg.geometry_polyline,
                is_approx=leg.is_approx,
            )
        )

    option.cached_ground_distance_km = round(total_km, 2)
    option.cached_distance_is_approx = any_approx
    return option.cached_ground_distance_km, option.cached_distance_is_approx


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
    plan = build_option_route_plan(
        option,
        items,
        departure_stay=departure_stay,
        invalidate_item_ids=invalidate_item_ids,
        force_refresh=force_refresh,
    )
    computed_legs = await compute_missing_route_legs([plan], provider)
    return await apply_option_route_plan(db, option, plan, computed_legs)
