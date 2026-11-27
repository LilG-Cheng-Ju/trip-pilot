"""MCP tools for itinerary item CRUD, choice switching, and reordering."""

from typing import Any

from app.api.v1.mcp.runtime import (
    ItemTypeLiteral,
    dump_model,
    json_text,
    mcp_server,
    tool_session,
)
from app.models.enums import ItemType
from app.schemas.trip import (
    DayOptionResponse,
    ItineraryItemCreate,
    ItineraryItemResponse,
    ItineraryItemUpdate,
)
from app.services.trip_service import TripService


def _build_item_create(
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
) -> ItineraryItemCreate:
    raw: dict[str, Any] = {
        "type": ItemType(item_type),
        "title": title,
        "start_time": start_time,
        "end_time": end_time,
        "address": address,
        "latitude": latitude,
        "longitude": longitude,
        "google_maps_url": google_maps_url,
        "notes": notes,
        "details": details,
        "alternative_for_item_id": alternative_for_item_id,
    }
    return ItineraryItemCreate(**{k: v for k, v in raw.items() if v is not None})


def _resolve_option_id_for_date(
    trip: Any, trip_id: str, target_date: str, option_label: str | None
) -> str:
    matching_day = next(
        (day for day in trip.days if day.date.isoformat() == target_date),
        None,
    )
    if matching_day is None:
        available = [day.date.isoformat() for day in trip.days]
        raise ValueError(
            f"Date '{target_date}' not found in trip '{trip_id}'. "
            f"Available dates: {available}"
        )
    if option_label is not None:
        needle = option_label.strip().lower()
        matched_opt = next(
            (o for o in matching_day.options if o.label.strip().lower() == needle),
            None,
        )
        if matched_opt is None:
            labels = [o.label for o in matching_day.options]
            raise ValueError(
                f"Option label '{option_label}' not found on {target_date}. "
                f"Available options: {labels}"
            )
        return str(matched_opt.id)
    if not matching_day.active_option_id:
        raise ValueError(
            f"TripDay for '{target_date}' has no active_option_id set."
        )
    return str(matching_day.active_option_id)


@mcp_server.tool()
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
) -> str:
    """Add an itinerary item to a day option."""
    async with tool_session("trips:write") as ctx:
        payload = _build_item_create(
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
        item = await TripService(ctx.db).add_item(
            option_id, ctx.auth_ctx.user.id, payload
        )
        return json_text(dump_model(ItineraryItemResponse, item))


@mcp_server.tool()
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
) -> str:
    """Add an itinerary item to a trip by calendar date (YYYY-MM-DD)."""
    async with tool_session("trips:write") as ctx:
        trip_svc = TripService(ctx.db)
        trip = await trip_svc.get_trip_detail(trip_id, ctx.auth_ctx.user.id)
        option_id = _resolve_option_id_for_date(
            trip, trip_id, target_date, option_label
        )
        payload = _build_item_create(
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
        item = await trip_svc.add_item(option_id, ctx.auth_ctx.user.id, payload)
        return json_text(dump_model(ItineraryItemResponse, item))


@mcp_server.tool()
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
) -> str:
    """Partially update an existing itinerary item (time, coordinates, details)."""
    async with tool_session("trips:write") as ctx:
        raw_patch: dict[str, Any] = {
            "type": ItemType(type) if type is not None else None,
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
        item = await TripService(ctx.db).update_item(
            item_id, ctx.auth_ctx.user.id, ItineraryItemUpdate(**patch)
        )
        return json_text(dump_model(ItineraryItemResponse, item))


@mcp_server.tool()
async def delete_itinerary_item(item_id: str) -> str:
    """Delete an itinerary item by ID."""
    async with tool_session("trips:write") as ctx:
        await TripService(ctx.db).delete_item(item_id, ctx.auth_ctx.user.id)
        return json_text({"deleted": True, "item_id": item_id})


@mcp_server.tool()
async def select_choice_item(item_id: str) -> str:
    """Select an alternative item as the active choice within its slot group."""
    async with tool_session("trips:write") as ctx:
        opt = await TripService(ctx.db).select_choice_item(
            item_id, ctx.auth_ctx.user.id
        )
        return json_text(dump_model(DayOptionResponse, opt))


@mcp_server.tool()
async def reorder_itinerary_items(option_id: str, item_ids: list[str]) -> str:
    """Reorder all itinerary items within a DayOption and recalculate routes."""
    async with tool_session("trips:write") as ctx:
        opt = await TripService(ctx.db).reorder_items(
            option_id, ctx.auth_ctx.user.id, item_ids
        )
        return json_text(dump_model(DayOptionResponse, opt))
