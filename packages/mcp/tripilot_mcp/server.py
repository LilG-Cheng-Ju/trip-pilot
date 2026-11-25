"""Official MCPServer exposing Tripilot trip, itinerary, expense, and stats tools."""

from __future__ import annotations

import asyncio
from typing import Any, Literal

from mcp.server.mcpserver import MCPServer

from tripilot_mcp import __version__
from tripilot_mcp.client import TripilotClient

mcp = MCPServer("tripilot", version=__version__)

TripStatusLiteral = Literal["PLANNING", "ACTIVE", "COMPLETED", "ARCHIVED"]
ItemTypeLiteral = Literal[
    "FLIGHT",
    "RESERVED_TRANSIT",
    "LOCAL_TRANSIT",
    "STAY",
    "SPOT",
    "FOOD",
]
ExpenseCategoryLiteral = Literal[
    "FLIGHT",
    "LODGING",
    "TRANSIT",
    "FOOD",
    "ACTIVITY",
    "SHOPPING",
    "OTHER",
]
StatsScopeLiteral = Literal["all", "domestic", "international"]

_PLACES_MAX_LIMIT = 10
_AIRPORTS_MAX_LIMIT = 30

_shared_client: TripilotClient | None = None
_shared_client_loop: asyncio.AbstractEventLoop | None = None
_shared_client_cls: Any = None


def _get_shared_client() -> TripilotClient:
    """Return a loop-scoped TripilotClient so tools reuse one httpx connection pool."""
    global _shared_client, _shared_client_loop, _shared_client_cls
    loop = asyncio.get_running_loop()
    if (
        _shared_client is None
        or _shared_client_loop is not loop
        or _shared_client_cls is not TripilotClient
    ):
        _shared_client = TripilotClient()
        _shared_client_loop = loop
        _shared_client_cls = TripilotClient
    return _shared_client


async def close_shared_client() -> None:
    """Close and clear the shared TripilotClient if initialized."""
    global _shared_client, _shared_client_loop, _shared_client_cls
    client = _shared_client
    _shared_client = None
    _shared_client_loop = None
    _shared_client_cls = None
    if client is None:
        return
    if hasattr(client, "aclose"):
        await client.aclose()
    elif hasattr(client, "close"):
        await client.close()


def _build_item_payload(
    *,
    item_type: ItemTypeLiteral,
    title: str,
    start_time: str | None = None,
    end_time: str | None = None,
    address: str | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
    google_maps_url: str | None = None,
    notes: str | None = None,
    details: dict[str, Any] | None = None,
    alternative_for_item_id: str | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "type": item_type,
        "title": title,
    }
    optional_fields: dict[str, Any] = {
        "start_time": start_time,
        "end_time": end_time,
        "address": address,
        "latitude": latitude,
        "longitude": longitude,
        "google_maps_url": google_maps_url,
        "details": details,
        "notes": notes,
        "alternative_for_item_id": alternative_for_item_id,
    }
    for key, value in optional_fields.items():
        if value is not None:
            payload[key] = value
    return payload


@mcp.tool()
async def list_trips(status: TripStatusLiteral | None = None) -> list[dict[str, Any]]:
    """List the user's trips, optionally filtered by status.

    Args:
        status: Optional TripStatus filter: PLANNING, ACTIVE, COMPLETED, or ARCHIVED.
    """
    return await _get_shared_client().list_trips(status=status)


@mcp.tool()
async def get_trip(
    trip_id: str,
    day_index: int | None = None,
) -> dict[str, Any]:
    """Fetch a trip's full itinerary including days, day options, and items.

    Args:
        trip_id: Unique identifier of the trip.
        day_index: Optional 1-based day index to filter the returned days list.
    """
    trip = await _get_shared_client().get_trip(trip_id)

    if day_index is not None:
        days: list[dict[str, Any]] = trip.get("days", [])
        filtered = [day for day in days if day.get("day_index") == day_index]
        if not filtered:
            available = [day.get("day_index") for day in days]
            raise ValueError(
                f"day_index {day_index} not found in trip '{trip_id}'. "
                f"Available day_index values: {available}"
            )
        trip = {**trip, "days": filtered}

    return trip


@mcp.tool()
async def create_trip(
    title: str,
    start_date: str,
    end_date: str,
    country_codes: list[str],
    default_currency: str = "JPY",
    destination_summary: str | None = None,
) -> dict[str, Any]:
    """Create a new trip and auto-generate its days and default Plan A options.

    Args:
        title: Human-readable trip title (e.g. "Tokyo & Kyoto Autumn 2026").
        start_date: Inclusive trip start date in YYYY-MM-DD format.
        end_date: Inclusive trip end date in YYYY-MM-DD format.
        country_codes: List of ISO 3166-1 alpha-2 country codes (e.g. ["JP"]).
        default_currency: 3-letter ISO currency code for expenses (default "JPY").
        destination_summary: Optional short destination summary.
    """
    return await _get_shared_client().create_trip(
        title=title,
        start_date=start_date,
        end_date=end_date,
        country_codes=country_codes,
        default_currency=default_currency,
        destination_summary=destination_summary,
    )


@mcp.tool()
async def append_day(trip_id: str) -> dict[str, Any]:
    """Append a new calendar day (with default Plan A) to an existing trip.

    Args:
        trip_id: Target trip ID.
    """
    return await _get_shared_client().append_day(trip_id=trip_id)


@mcp.tool()
async def update_day_title(
    day_id: str,
    title: str | None = None,
    notes: str | None = None,
) -> dict[str, Any]:
    """Set or update a TripDay's theme title or notes.

    Args:
        day_id: Target TripDay ID.
        title: Concise day focus/area (e.g. "East Busan · Luge & Sky Capsule").
        notes: Optional day-level notes.
    """
    return await _get_shared_client().update_day(
        day_id=day_id, title=title, notes=notes
    )


@mcp.tool()
async def delete_trip_day(day_id: str) -> dict[str, Any]:
    """Delete a TripDay, unlink its expenses, and re-index remaining days.

    Args:
        day_id: ID of the TripDay to remove (rejected if it is the sole day).
    """
    await _get_shared_client().delete_day(day_id=day_id)
    return {"deleted": True, "day_id": day_id}


@mcp.tool()
async def create_day_option(
    day_id: str,
    label: str,
    clone_from_option_id: str | None = None,
    summary_notes: str | None = None,
) -> dict[str, Any]:
    """Create a new DayOption (e.g. Plan B / Rainy Day) on a TripDay.

    If clone_from_option_id is provided, clones that option's items into the new
    variant without modifying the original or changing active_option_id.

    Args:
        day_id: ID of the target TripDay.
        label: Label for the new option (e.g. "Plan B - Rainy Day").
        clone_from_option_id: Optional existing DayOption ID to deep-clone.
        summary_notes: Optional notes (used when creating a fresh empty option).
    """
    client = _get_shared_client()
    if clone_from_option_id:
        return await client.clone_day_option(
            option_id=clone_from_option_id,
            label=label,
        )
    return await client.add_day_option(
        day_id=day_id,
        label=label,
        summary_notes=summary_notes,
    )


@mcp.tool()
async def clone_day_option(
    option_id: str,
    label: str,
) -> dict[str, Any]:
    """Deep-clone an existing DayOption into a new Plan B / alternative day plan."""
    return await _get_shared_client().clone_day_option(
        option_id=option_id, label=label
    )


@mcp.tool()
async def rename_day_option(
    option_id: str,
    label: str,
) -> dict[str, Any]:
    """Rename an existing DayOption."""
    return await _get_shared_client().update_day_option(
        option_id=option_id, label=label
    )


@mcp.tool()
async def delete_day_option(option_id: str) -> dict[str, Any]:
    """Delete a DayOption (rejected if it is the last remaining option on the day)."""
    return await _get_shared_client().delete_day_option(option_id=option_id)


@mcp.tool()
async def set_active_option(
    day_id: str,
    option_id: str,
) -> dict[str, Any]:
    """Switch the active DayOption pointer for a TripDay.

    Args:
        day_id: ID of the TripDay to update.
        option_id: ID of the DayOption belonging to that day to activate.
    """
    return await _get_shared_client().set_active_option(
        day_id=day_id,
        day_option_id=option_id,
    )


@mcp.tool()
async def add_itinerary_item(
    option_id: str,
    type: ItemTypeLiteral,
    title: str,
    start_time: str | None = None,
    end_time: str | None = None,
    address: str | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
    google_maps_url: str | None = None,
    notes: str | None = None,
    details: dict[str, Any] | None = None,
    alternative_for_item_id: str | None = None,
) -> dict[str, Any]:
    """Add an itinerary item directly to a known DayOption ID.

    Args:
        option_id: Target DayOption ID.
        type: One of FLIGHT, RESERVED_TRANSIT, LOCAL_TRANSIT, STAY, SPOT, FOOD.
        title: Concise item title.
        start_time: Optional start time string (HH:MM, e.g. "09:30").
        end_time: Optional end time string (HH:MM, e.g. "12:15").
        address: Optional street address or station/airport name.
        latitude: Optional WGS84 latitude (-90 to 90).
        longitude: Optional WGS84 longitude (-180 to 180).
        google_maps_url: Optional Google Maps deep link.
        notes: Optional private notes.
        details: Optional type-specific metadata dictionary (e.g. flight_number,
            origin_iata, dest_iata, booking_ref, local_name, attachments).
        alternative_for_item_id: Optional existing item ID to attach this item as a
            slot-level multi-choice alternative (e.g. lunch 3-way choice).
    """
    payload = _build_item_payload(
        item_type=type,
        title=title,
        start_time=start_time,
        end_time=end_time,
        address=address,
        latitude=latitude,
        longitude=longitude,
        google_maps_url=google_maps_url,
        notes=notes,
        details=details,
        alternative_for_item_id=alternative_for_item_id,
    )
    return await _get_shared_client().add_item(option_id=option_id, payload=payload)


@mcp.tool()
async def add_item_by_date(
    trip_id: str,
    target_date: str,
    type: ItemTypeLiteral,
    title: str,
    option_label: str | None = None,
    start_time: str | None = None,
    end_time: str | None = None,
    address: str | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
    google_maps_url: str | None = None,
    notes: str | None = None,
    details: dict[str, Any] | None = None,
    alternative_for_item_id: str | None = None,
) -> dict[str, Any]:
    """Add an itinerary item to a trip by calendar date (YYYY-MM-DD).

    Resolves the TripDay matching target_date and targets either option_label
    (if specified, case-insensitive) or the day's active_option_id.

    Args:
        trip_id: Target trip ID.
        target_date: Calendar date in YYYY-MM-DD format.
        type: One of FLIGHT, RESERVED_TRANSIT, LOCAL_TRANSIT, STAY, SPOT, FOOD.
        title: Concise item title.
        option_label: Optional DayOption label (e.g. "Plan B - Rainy Day").
        start_time: Optional start time string (HH:MM, e.g. "14:00").
        end_time: Optional end time string (HH:MM, e.g. "15:30").
        address: Optional street address or station/airport name.
        latitude: Optional WGS84 latitude (-90 to 90).
        longitude: Optional WGS84 longitude (-180 to 180).
        google_maps_url: Optional Google Maps deep link.
        notes: Optional private notes.
        details: Optional type-specific metadata dictionary (include local_name for
            international venues).
        alternative_for_item_id: Optional existing item ID to attach as a slot choice.
    """
    payload = _build_item_payload(
        item_type=type,
        title=title,
        start_time=start_time,
        end_time=end_time,
        address=address,
        latitude=latitude,
        longitude=longitude,
        google_maps_url=google_maps_url,
        notes=notes,
        details=details,
        alternative_for_item_id=alternative_for_item_id,
    )
    return await _get_shared_client().add_item_by_date(
        trip_id=trip_id,
        target_date=target_date,
        payload=payload,
        option_label=option_label,
    )


@mcp.tool()
async def update_itinerary_item(
    item_id: str,
    type: ItemTypeLiteral | None = None,
    sort_order: int | None = None,
    is_selected: bool | None = None,
    title: str | None = None,
    start_time: str | None = None,
    end_time: str | None = None,
    address: str | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
    google_maps_url: str | None = None,
    notes: str | None = None,
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Partially update an existing itinerary item (time, coordinates, notes, etc.)."""
    raw_patch: dict[str, Any] = {
        "type": type,
        "sort_order": sort_order,
        "is_selected": is_selected,
        "title": title,
        "start_time": start_time,
        "end_time": end_time,
        "address": address,
        "latitude": latitude,
        "longitude": longitude,
        "google_maps_url": google_maps_url,
        "notes": notes,
        "details": details,
    }
    patch = {k: v for k, v in raw_patch.items() if v is not None}
    return await _get_shared_client().update_item(item_id=item_id, payload=patch)


@mcp.tool()
async def delete_itinerary_item(item_id: str) -> dict[str, Any]:
    """Delete an itinerary item by ID.

    Args:
        item_id: ID of the itinerary item to remove.
    """
    await _get_shared_client().delete_item(item_id=item_id)
    return {"deleted": True, "item_id": item_id}


@mcp.tool()
async def select_choice_item(item_id: str) -> dict[str, Any]:
    """Promote an itinerary item as the active choice within its slot choice group.

    Args:
        item_id: ID of the item to activate.
    """
    return await _get_shared_client().select_choice_item(item_id=item_id)


@mcp.tool()
async def search_places(
    query: str,
    lang: str = "zh-TW",
    limit: int = 5,
) -> list[dict[str, Any]]:
    """Search places/venues via Google Places API (New) or Photon fallback.

    Args:
        query: Venue, landmark, or address keyword (e.g. "Senso-ji", "안목 서면점").
        lang: Preferred language code (default "zh-TW").
        limit: Maximum number of results (1-10, default 5).
    """
    clamped = max(1, min(limit, _PLACES_MAX_LIMIT))
    return await _get_shared_client().search_places(q=query, lang=lang, limit=clamped)


@mcp.tool()
async def resolve_google_maps_url(url: str) -> dict[str, Any]:
    """Resolve a Google Maps URL (full or maps.app.goo.gl) into name and coordinates.

    Args:
        url: Google Maps link.
    """
    return await _get_shared_client().resolve_place_url(url=url)


@mcp.tool()
async def search_airports(
    query: str,
    limit: int = 10,
) -> list[dict[str, Any]]:
    """Search commercial airports by IATA code, city, or airport name.

    Args:
        query: Search string (e.g. "NRT", "Tokyo", "Taipei").
        limit: Maximum number of results (1-30, default 10).
    """
    clamped = max(1, min(limit, _AIRPORTS_MAX_LIMIT))
    return await _get_shared_client().search_airports(q=query, limit=clamped)


@mcp.tool()
async def list_expenses(trip_id: str) -> dict[str, Any]:
    """List all expenses and category totals for a trip."""
    return await _get_shared_client().list_expenses(trip_id=trip_id)


@mcp.tool()
async def add_expense(
    trip_id: str,
    title: str,
    category: ExpenseCategoryLiteral,
    amount_original: float,
    currency_original: str,
    exchange_rate: float | None = None,
    trip_day_id: str | None = None,
    itinerary_item_id: str | None = None,
    payment_method: str | None = None,
    notes: str | None = None,
) -> dict[str, Any]:
    """Log an actual expense (auto-fetches FX when exchange_rate is omitted).

    Args:
        trip_id: Target trip ID.
        title: Short description of the purchase or booking.
        category: One of FLIGHT, LODGING, TRANSIT, FOOD, ACTIVITY, SHOPPING, OTHER.
        amount_original: Positive amount in the original transaction currency.
        currency_original: 3-letter ISO currency code (e.g. "JPY", "USD", "TWD").
        exchange_rate: Optional conversion multiplier to home currency.
        trip_day_id: Optional TripDay ID to associate the expense with a specific day.
        itinerary_item_id: Optional ItineraryItem ID to link the expense to a stop.
        payment_method: Optional payment method (e.g. "Visa", "Suica", "Cash").
        notes: Optional notes or receipt reference.
    """
    payload: dict[str, Any] = {
        "title": title,
        "category": category,
        "amount_original": amount_original,
        "currency_original": currency_original.strip().upper(),
    }
    optional_fields: dict[str, Any] = {
        "exchange_rate": exchange_rate,
        "trip_day_id": trip_day_id,
        "itinerary_item_id": itinerary_item_id,
        "payment_method": payment_method,
        "notes": notes,
    }
    for key, value in optional_fields.items():
        if value is not None:
            payload[key] = value

    return await _get_shared_client().log_expense(trip_id=trip_id, payload=payload)


@mcp.tool()
async def get_fx_rate(
    from_currency: str,
    to_currency: str = "TWD",
) -> dict[str, Any]:
    """Get the cached live exchange rate between two ISO-4217 currency codes."""
    return await _get_shared_client().get_fx_rate(
        from_currency=from_currency, to_currency=to_currency
    )


@mcp.tool()
async def get_travel_stats(
    year: int | None = None,
    scope: StatsScopeLiteral = "all",
) -> dict[str, Any]:
    """Retrieve annual (when year is provided) or lifetime travel statistics.

    Args:
        year: Optional 4-digit calendar year (e.g. 2026). Omit for lifetime totals.
        scope: Filter scope: "all", "domestic", or "international".
    """
    return await _get_shared_client().get_stats(year=year, scope=scope)


def main() -> None:
    """Run the Tripilot MCP server over stdio."""
    mcp.run()


if __name__ == "__main__":
    main()
