"""Pure domain helpers for itinerary ordering and flight airport enrichment."""

import re
from datetime import time
from typing import Any

from fastapi import HTTPException, status

from app.models import ItemType, ItineraryItem
from app.services.airport_service import compute_flight_distance_km, get_airport

_START_TIME_RE = re.compile(r"^(\d{1,2}):(\d{2})(?::(\d{2}))?$")


def require_found[T](entity: T | None, detail: str) -> T:
    """Return a loaded entity or raise an explicit HTTP 404 instead of asserting."""
    if entity is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)
    return entity


def norm_iata(value: object) -> str | None:
    """Normalize an optional airport IATA code string."""
    return value.strip().upper() if isinstance(value, str) and value.strip() else None


def parse_start_time(value: str | None) -> time | None:
    """Parse an HH:MM (or H:MM / HH:MM:SS) string into a comparable time."""
    if not value:
        return None
    match = _START_TIME_RE.fullmatch(value.strip())
    if match is None:
        return None
    hour = int(match.group(1))
    minute = int(match.group(2))
    second = int(match.group(3)) if match.group(3) is not None else 0
    if not (0 <= hour <= 23 and 0 <= minute <= 59 and 0 <= second <= 59):
        return None
    return time(hour, minute, second)


def group_existing_slots(items: list[ItineraryItem]) -> list[list[ItineraryItem]]:
    """Group ordered items by choice_group_id so slot alternatives move together."""
    slots: list[list[ItineraryItem]] = []
    slots_by_group: dict[str, list[ItineraryItem]] = {}
    for item in items:
        if not item.choice_group_id:
            slots.append([item])
            continue
        group_slot = slots_by_group.get(item.choice_group_id)
        if group_slot is None:
            group_slot = []
            slots_by_group[item.choice_group_id] = group_slot
            slots.append(group_slot)
        group_slot.append(item)
    return slots


def compute_chronological_insert_index(
    slots: list[list[ItineraryItem]], new_start_time: time
) -> int:
    """Compute the deterministic chronological insertion index across slots."""
    last_timed_idx: int | None = None
    for idx, slot in enumerate(slots):
        primary = next((member for member in slot if member.is_selected), slot[0])
        existing_time = parse_start_time(primary.start_time)
        if existing_time is None:
            continue
        if existing_time > new_start_time:
            return idx
        last_timed_idx = idx
    return last_timed_idx + 1 if last_timed_idx is not None else len(slots)


def resolve_flight_airport_coords(
    details: dict[str, Any], home_country: str = "TW"
) -> tuple[float | None, float | None]:
    """Pick destination/foreign airport coords so flights appear on trip maps."""
    origin_code = details.get("origin_iata")
    dest_code = details.get("dest_iata")
    origin = get_airport(origin_code) if isinstance(origin_code, str) else None
    dest = get_airport(dest_code) if isinstance(dest_code, str) else None

    # Prefer the airport outside home_country (e.g. PUS for TPE->PUS and PUS->TPE).
    if dest and dest.country_code != home_country:
        return dest.latitude, dest.longitude
    if origin and origin.country_code != home_country:
        return origin.latitude, origin.longitude
    chosen = dest or origin
    return (chosen.latitude, chosen.longitude) if chosen else (None, None)


def enrich_flight_details(
    item_type: str, details: dict[str, Any], *, recompute_distance: bool = False
) -> dict[str, Any]:
    """Auto-populate Great-Circle flight distance when origin/dest IATA are given."""
    enriched = dict(details)
    if item_type != ItemType.FLIGHT.value:
        return enriched
    origin = enriched.get("origin_iata")
    dest = enriched.get("dest_iata")
    if isinstance(origin, str) and isinstance(dest, str):
        enriched["origin_iata"] = origin.strip().upper()
        enriched["dest_iata"] = dest.strip().upper()
        if (
            recompute_distance
            or "distance_km" not in enriched
            or enriched["distance_km"] is None
        ):
            dist = compute_flight_distance_km(
                enriched["origin_iata"], enriched["dest_iata"]
            )
            if dist is not None:
                enriched["distance_km"] = dist
            elif recompute_distance:
                enriched.pop("distance_km", None)
    elif recompute_distance:
        enriched.pop("distance_km", None)
    return enriched
