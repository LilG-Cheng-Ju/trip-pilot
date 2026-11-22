"""FastMCP server exposing Tripilot trip, itinerary, expense, and stats tools."""

from __future__ import annotations

from typing import Any

from mcp.server.fastmcp import FastMCP

from tripilot_mcp.client import TripilotClient

mcp = FastMCP("tripilot")


def _build_item_payload(
    *,
    item_type: str,
    title: str,
    start_time: str | None = None,
    end_time: str | None = None,
    address: str | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
    google_maps_url: str | None = None,
    notes: str | None = None,
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "type": item_type.strip().upper(),
        "title": title,
        "details": details if details is not None else {},
    }
    optional_fields: dict[str, Any] = {
        "start_time": start_time,
        "end_time": end_time,
        "address": address,
        "latitude": latitude,
        "longitude": longitude,
        "google_maps_url": google_maps_url,
        "notes": notes,
    }
    for key, value in optional_fields.items():
        if value is not None:
            payload[key] = value
    return payload


@mcp.tool()
async def list_trips(status: str | None = None) -> list[dict[str, Any]]:
    """List the user's trips, optionally filtered by status.

    Args:
        status: Optional TripStatus filter: PLANNING, ACTIVE, COMPLETED, or ARCHIVED.
    """
    async with TripilotClient() as client:
        return await client.list_trips(status=status)


@mcp.tool()
async def get_trip_itinerary(
    trip_id: str,
    day_index: int | None = None,
) -> dict[str, Any]:
    """Fetch a trip's full itinerary including days, day options, and items.

    Args:
        trip_id: Unique identifier of the trip.
        day_index: Optional 1-based day index to filter the returned days list.
    """
    async with TripilotClient() as client:
        trip = await client.get_trip(trip_id)

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
    async with TripilotClient() as client:
        return await client.create_trip(
            title=title,
            start_date=start_date,
            end_date=end_date,
            country_codes=country_codes,
            default_currency=default_currency,
            destination_summary=destination_summary,
        )


@mcp.tool()
async def create_day_option(
    trip_day_id: str,
    label: str,
    clone_from_option_id: str | None = None,
    summary_notes: str | None = None,
) -> dict[str, Any]:
    """Create a new DayOption (e.g. Plan B / Rainy Day) on a TripDay.

    If clone_from_option_id is provided, clones that option's items into the new
    variant without modifying the original or changing active_option_id.

    Args:
        trip_day_id: ID of the target TripDay.
        label: Label for the new option (e.g. "Plan B - Rainy Day").
        clone_from_option_id: Optional existing DayOption ID to deep-clone.
        summary_notes: Optional notes (used when creating a fresh empty option).
    """
    async with TripilotClient() as client:
        if clone_from_option_id:
            return await client.clone_day_option(
                option_id=clone_from_option_id,
                label=label,
            )
        return await client.add_day_option(
            day_id=trip_day_id,
            label=label,
            summary_notes=summary_notes,
        )


@mcp.tool()
async def set_active_day_option(
    trip_day_id: str,
    day_option_id: str,
) -> dict[str, Any]:
    """Switch the active DayOption pointer for a TripDay.

    Args:
        trip_day_id: ID of the TripDay to update.
        day_option_id: ID of the DayOption belonging to that day to activate.
    """
    async with TripilotClient() as client:
        return await client.set_active_option(
            day_id=trip_day_id,
            day_option_id=day_option_id,
        )


@mcp.tool()
async def add_itinerary_item(
    day_option_id: str,
    item_type: str,
    title: str,
    start_time: str | None = None,
    end_time: str | None = None,
    address: str | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
    google_maps_url: str | None = None,
    notes: str | None = None,
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Add an itinerary item directly to a known DayOption ID.

    Args:
        day_option_id: Target DayOption ID.
        item_type: One of FLIGHT, RESERVED_TRANSIT, LOCAL_TRANSIT, STAY, SPOT, FOOD.
        title: Concise item title.
        start_time: Optional start time string (e.g. "09:30").
        end_time: Optional end time string (e.g. "12:15").
        address: Optional street address or station/airport name.
        latitude: Optional WGS84 latitude (-90 to 90).
        longitude: Optional WGS84 longitude (-180 to 180).
        google_maps_url: Optional Google Maps deep link.
        notes: Optional private notes.
        details: Optional type-specific metadata dictionary (e.g. flight_number,
            dep_iata, arr_iata, booking_ref, distance_km, train_number).
    """
    payload = _build_item_payload(
        item_type=item_type,
        title=title,
        start_time=start_time,
        end_time=end_time,
        address=address,
        latitude=latitude,
        longitude=longitude,
        google_maps_url=google_maps_url,
        notes=notes,
        details=details,
    )
    async with TripilotClient() as client:
        return await client.add_item(option_id=day_option_id, payload=payload)


@mcp.tool()
async def add_item_by_date(
    trip_id: str,
    target_date: str,
    item_type: str,
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
) -> dict[str, Any]:
    """Add an itinerary item to a trip by calendar date (YYYY-MM-DD).

    Resolves the TripDay matching target_date and targets either option_label
    (if specified, case-insensitive) or the day's active_option_id.

    Args:
        trip_id: Target trip ID.
        target_date: Calendar date in YYYY-MM-DD format.
        item_type: One of FLIGHT, RESERVED_TRANSIT, LOCAL_TRANSIT, STAY, SPOT, FOOD.
        title: Concise item title.
        option_label: Optional DayOption label (e.g. "Plan B - Rainy Day").
        start_time: Optional start time string (e.g. "14:00").
        end_time: Optional end time string (e.g. "15:30").
        address: Optional street address or station/airport name.
        latitude: Optional WGS84 latitude (-90 to 90).
        longitude: Optional WGS84 longitude (-180 to 180).
        google_maps_url: Optional Google Maps deep link.
        notes: Optional private notes.
        details: Optional type-specific metadata dictionary.
    """
    payload = _build_item_payload(
        item_type=item_type,
        title=title,
        start_time=start_time,
        end_time=end_time,
        address=address,
        latitude=latitude,
        longitude=longitude,
        google_maps_url=google_maps_url,
        notes=notes,
        details=details,
    )
    async with TripilotClient() as client:
        return await client.add_item_by_date(
            trip_id=trip_id,
            target_date=target_date,
            payload=payload,
            option_label=option_label,
        )


@mcp.tool()
async def update_itinerary_item(
    item_id: str,
    updates: dict[str, Any],
) -> dict[str, Any]:
    """Partially update fields on an existing itinerary item.

    Args:
        item_id: ID of the itinerary item to update.
        updates: Dictionary of fields to patch (e.g. title, start_time, notes, details).
    """
    async with TripilotClient() as client:
        return await client.update_item(item_id=item_id, payload=updates)


@mcp.tool()
async def delete_itinerary_item(item_id: str) -> dict[str, Any]:
    """Delete an itinerary item by ID.

    Args:
        item_id: ID of the itinerary item to remove.
    """
    async with TripilotClient() as client:
        await client.delete_item(item_id=item_id)
    return {"deleted": True, "item_id": item_id}


@mcp.tool()
async def log_expense(
    trip_id: str,
    title: str,
    category: str,
    amount_original: float,
    currency_original: str,
    exchange_rate: float = 1.0,
    payment_method: str | None = None,
    trip_day_id: str | None = None,
    notes: str | None = None,
) -> dict[str, Any]:
    """Log an actual expense against a trip.

    Args:
        trip_id: Target trip ID.
        title: Short description of the purchase or booking.
        category: One of FLIGHT, LODGING, TRANSIT, FOOD, ACTIVITY, SHOPPING, OTHER.
        amount_original: Positive amount in the original transaction currency.
        currency_original: 3-letter ISO currency code (e.g. "JPY", "USD", "TWD").
        exchange_rate: Multiplier to convert original currency to user's home currency.
        payment_method: Optional payment method (e.g. "Visa", "Suica", "Cash").
        trip_day_id: Optional TripDay ID to associate the expense with a specific day.
        notes: Optional notes or receipt reference.
    """
    payload: dict[str, Any] = {
        "title": title,
        "category": category.strip().upper(),
        "amount_original": amount_original,
        "currency_original": currency_original.strip().upper(),
        "exchange_rate": exchange_rate,
    }
    if payment_method is not None:
        payload["payment_method"] = payment_method
    if trip_day_id is not None:
        payload["trip_day_id"] = trip_day_id
    if notes is not None:
        payload["notes"] = notes

    async with TripilotClient() as client:
        return await client.log_expense(trip_id=trip_id, payload=payload)


@mcp.tool()
async def get_travel_stats(year: int | None = None) -> dict[str, Any]:
    """Retrieve annual (when year is provided) or lifetime travel statistics.

    Args:
        year: Optional 4-digit calendar year (e.g. 2026). Omit for lifetime totals.
    """
    async with TripilotClient() as client:
        return await client.get_stats(year=year)


@mcp.tool()
async def search_airports(query: str) -> list[dict[str, Any]]:
    """Search commercial airports by IATA code, city, or airport name.

    Args:
        query: Search string (e.g. "NRT", "Tokyo", "Taipei").
    """
    async with TripilotClient() as client:
        return await client.search_airports(q=query)


def main() -> None:
    """Run the Tripilot MCP server over stdio."""
    mcp.run()


if __name__ == "__main__":
    main()
