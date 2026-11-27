"""MCP tools for trips, days, Plan A/B options, route refresh, and shares."""

from datetime import date
from typing import Any

from app.api.v1.mcp.runtime import (
    TripStatusLiteral,
    dump_model,
    json_text,
    mcp_server,
    parse_iso_datetime,
    tool_session,
)
from app.models.enums import TripStatus
from app.schemas.trip import (
    DayOptionCloneRequest,
    DayOptionCreate,
    DayOptionResponse,
    DayOptionUpdate,
    ShareVisibilityPolicy,
    TripCreate,
    TripDayResponse,
    TripDayUpdate,
    TripDetailResponse,
    TripShareCreate,
    TripShareResponse,
    TripSummaryResponse,
    TripUpdate,
)
from app.services.trip_service import TripService


@mcp_server.tool()
async def list_trips(status: TripStatusLiteral | None = None) -> str:
    """List trips belonging to the user, optionally filtered by status."""
    async with tool_session("trips:read") as ctx:
        trips = await TripService(ctx.db).list_trips(ctx.auth_ctx.user.id, status)
        return json_text([dump_model(TripSummaryResponse, t) for t in trips])


@mcp_server.tool()
async def get_trip(trip_id: str, day_index: int | None = None) -> str:
    """Get full trip details including all days, Plan A/B options, and items."""
    async with tool_session("trips:read") as ctx:
        trip = await TripService(ctx.db).get_trip_detail(
            trip_id, ctx.auth_ctx.user.id
        )
        data = dump_model(TripDetailResponse, trip)
        if day_index is not None:
            filtered = [
                d for d in data.get("days", []) if d.get("day_index") == day_index
            ]
            if not filtered:
                available = [d.get("day_index") for d in data.get("days", [])]
                raise ValueError(
                    f"day_index {day_index} not found in trip '{trip_id}'. "
                    f"Available day_index values: {available}"
                )
            data["days"] = filtered
        return json_text(data)


@mcp_server.tool()
async def create_trip(
    title: str,
    start_date: str,
    end_date: str,
    country_codes: list[str],
    default_currency: str = "JPY",
    destination_summary: str | None = None,
) -> str:
    """Create a new trip and auto-generate its days and default Plan A options."""
    async with tool_session("trips:write") as ctx:
        payload = TripCreate(
            title=title,
            start_date=date.fromisoformat(start_date),
            end_date=date.fromisoformat(end_date),
            country_codes=[c.upper() for c in country_codes],
            default_currency=default_currency.upper(),
            destination_summary=destination_summary,
        )
        trip = await TripService(ctx.db).create_trip(ctx.auth_ctx.user.id, payload)
        return json_text(dump_model(TripDetailResponse, trip))


@mcp_server.tool()
async def update_trip(
    trip_id: str,
    title: str | None = None,
    destination_summary: str | None = None,
    country_codes: list[str] | None = None,
    start_date: str | None = None,
    default_currency: str | None = None,
    status: TripStatusLiteral | None = None,
    notes: str | None = None,
) -> str:
    """Update trip metadata, status, or shift start_date across all days."""
    async with tool_session("trips:write") as ctx:
        raw: dict[str, Any] = {
            "title": title,
            "destination_summary": destination_summary,
            "country_codes": [c.upper() for c in country_codes]
            if country_codes is not None
            else None,
            "start_date": date.fromisoformat(start_date)
            if start_date is not None
            else None,
            "default_currency": default_currency.upper()
            if default_currency is not None
            else None,
            "status": TripStatus(status) if status is not None else None,
            "notes": notes,
        }
        patch = {k: v for k, v in raw.items() if v is not None}
        trip = await TripService(ctx.db).update_trip(
            trip_id, ctx.auth_ctx.user.id, TripUpdate(**patch)
        )
        return json_text(dump_model(TripDetailResponse, trip))


@mcp_server.tool()
async def delete_trip(trip_id: str) -> str:
    """Delete a trip and all of its days, options, items, shares, and expenses."""
    async with tool_session("trips:write") as ctx:
        await TripService(ctx.db).delete_trip(trip_id, ctx.auth_ctx.user.id)
        return json_text({"deleted": True, "trip_id": trip_id})


@mcp_server.tool()
async def append_day(trip_id: str) -> str:
    """Append one new day (with a default Plan A) to the end of a trip."""
    async with tool_session("trips:write") as ctx:
        day = await TripService(ctx.db).append_day(trip_id, ctx.auth_ctx.user.id)
        return json_text(dump_model(TripDayResponse, day))


@mcp_server.tool()
async def update_day_title(
    day_id: str,
    title: str | None = None,
    notes: str | None = None,
) -> str:
    """Set or update a TripDay's theme title or notes."""
    async with tool_session("trips:write") as ctx:
        fields = {
            k: v
            for k, v in {"title": title, "notes": notes}.items()
            if v is not None
        }
        day = await TripService(ctx.db).update_day(
            day_id, ctx.auth_ctx.user.id, TripDayUpdate(**fields)
        )
        return json_text(dump_model(TripDayResponse, day))


@mcp_server.tool()
async def delete_trip_day(day_id: str) -> str:
    """Delete a trip day, unlink its expenses, and re-index remaining days."""
    async with tool_session("trips:write") as ctx:
        await TripService(ctx.db).delete_day(day_id, ctx.auth_ctx.user.id)
        return json_text({"deleted": True, "day_id": day_id})


@mcp_server.tool()
async def create_day_option(
    day_id: str,
    label: str,
    clone_from_option_id: str | None = None,
    summary_notes: str | None = None,
) -> str:
    """Create a new Plan B / alternative day option (blank or cloned) on a day."""
    async with tool_session("trips:write") as ctx:
        trip_svc = TripService(ctx.db)
        if clone_from_option_id:
            opt = await trip_svc.clone_day_option(
                clone_from_option_id,
                ctx.auth_ctx.user.id,
                DayOptionCloneRequest(label=label),
            )
        else:
            opt = await trip_svc.add_day_option(
                day_id,
                ctx.auth_ctx.user.id,
                DayOptionCreate(label=label, summary_notes=summary_notes),
            )
        return json_text(dump_model(DayOptionResponse, opt))


@mcp_server.tool()
async def clone_day_option(option_id: str, label: str) -> str:
    """Deep-clone an existing Plan A/B day option into a new alternative plan."""
    async with tool_session("trips:write") as ctx:
        opt = await TripService(ctx.db).clone_day_option(
            option_id, ctx.auth_ctx.user.id, DayOptionCloneRequest(label=label)
        )
        return json_text(dump_model(DayOptionResponse, opt))


@mcp_server.tool()
async def rename_day_option(option_id: str, label: str) -> str:
    """Rename an existing day option (e.g. rename Plan A to 'Sunny Outdoor')."""
    async with tool_session("trips:write") as ctx:
        opt = await TripService(ctx.db).update_day_option(
            option_id, ctx.auth_ctx.user.id, DayOptionUpdate(label=label)
        )
        return json_text(dump_model(DayOptionResponse, opt))


@mcp_server.tool()
async def delete_day_option(option_id: str) -> str:
    """Delete a day option (rejected if it is the last remaining option on the day)."""
    async with tool_session("trips:write") as ctx:
        day = await TripService(ctx.db).delete_day_option(
            option_id, ctx.auth_ctx.user.id
        )
        return json_text(dump_model(TripDayResponse, day))


@mcp_server.tool()
async def set_active_option(day_id: str, option_id: str) -> str:
    """Set which Plan A/B day option is active for a trip day."""
    async with tool_session("trips:write") as ctx:
        day = await TripService(ctx.db).set_active_option(
            day_id, ctx.auth_ctx.user.id, option_id
        )
        return json_text(dump_model(TripDayResponse, day))


@mcp_server.tool()
async def recalculate_option_route(option_id: str) -> str:
    """Force-refresh cached ground route segments and distance for a DayOption."""
    async with tool_session("trips:write") as ctx:
        opt = await TripService(ctx.db).recalculate_option_route(
            option_id, ctx.auth_ctx.user.id
        )
        return json_text(dump_model(DayOptionResponse, opt))


@mcp_server.tool()
async def list_trip_shares(trip_id: str) -> str:
    """List all read-only share links and their visibility policies for a trip."""
    async with tool_session("trips:read") as ctx:
        shares = await TripService(ctx.db).list_shares(trip_id, ctx.auth_ctx.user.id)
        return json_text([dump_model(TripShareResponse, s) for s in shares])


@mcp_server.tool()
async def create_trip_share(
    trip_id: str,
    label: str | None = None,
    include_booking_refs: bool = False,
    include_notes: bool = False,
    include_expenses: bool = False,
    include_backup_options: bool = False,
    expires_at: str | None = None,
) -> str:
    """Create a read-only share link with explicit privacy policy controls."""
    async with tool_session("trips:write") as ctx:
        payload = TripShareCreate(
            label=label,
            visibility_policy=ShareVisibilityPolicy(
                include_booking_refs=include_booking_refs,
                include_notes=include_notes,
                include_expenses=include_expenses,
                include_backup_options=include_backup_options,
            ),
            expires_at=parse_iso_datetime(expires_at),
        )
        share = await TripService(ctx.db).create_share(
            trip_id, ctx.auth_ctx.user.id, payload
        )
        return json_text(dump_model(TripShareResponse, share))


@mcp_server.tool()
async def revoke_trip_share(trip_id: str, share_id: str) -> str:
    """Revoke an existing read-only share link so it can no longer be viewed."""
    async with tool_session("trips:write") as ctx:
        await TripService(ctx.db).revoke_share(
            trip_id, share_id, ctx.auth_ctx.user.id
        )
        return json_text({"revoked": True, "share_id": share_id})
