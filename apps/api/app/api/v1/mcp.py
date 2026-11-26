"""Remote Streamable HTTP MCP server (/mcp) and public English AI guide (/llms.txt)."""
# ruff: noqa: E501

import json
import logging
from collections.abc import AsyncGenerator, AsyncIterator
from contextlib import asynccontextmanager
from contextvars import ContextVar
from dataclasses import asdict, dataclass
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.openapi.utils import get_openapi
from fastapi.responses import JSONResponse, PlainTextResponse
from mcp import MCPError
from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.server.streamable_http_manager import StreamableHTTPSessionManager
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.types import Message

from app.api.v1.links import fetch_cloud_link_title
from app.core.auth import AuthContext, require_member_auth
from app.core.config import Settings, get_settings
from app.core.constants import (
    AIRPORTS_DEFAULT_LIMIT,
    AIRPORTS_MAX_LIMIT,
    PLACES_DEFAULT_LIMIT,
    PLACES_MAX_LIMIT,
)
from app.core.database import get_db
from app.core.rate_limit import enforce_user_rate_limit, limit_public_endpoint
from app.models.enums import ExpenseCategory, ItemType, TripStatus
from app.schemas.expense import ExpenseCreate, ExpenseResponse, ExpenseUpdate
from app.schemas.trip import (
    DayOptionCloneRequest,
    DayOptionCreate,
    DayOptionResponse,
    DayOptionUpdate,
    ItineraryItemCreate,
    ItineraryItemResponse,
    ItineraryItemUpdate,
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
from app.services.airport_service import search_airports as svc_search_airports
from app.services.expense_service import ExpenseService
from app.services.fx_service import get_fx_provider
from app.services.places import get_place_search_provider
from app.services.places import resolve_google_maps_url as svc_resolve_google_maps_url
from app.services.stats_service import StatsService
from app.services.trip_service import TripService

router = APIRouter(tags=["mcp"])
logger = logging.getLogger(__name__)

AuthDep = Annotated[AuthContext, Depends(require_member_auth)]
DbSession = Annotated[AsyncSession, Depends(get_db)]
SettingsDep = Annotated[Settings, Depends(get_settings)]

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

_INSUFFICIENT_SCOPE_CODE = -32003


@dataclass(frozen=True)
class _McpRequestContext:
    auth_ctx: AuthContext
    db: AsyncSession
    settings: Settings


_mcp_ctx: ContextVar[_McpRequestContext | None] = ContextVar("_mcp_ctx", default=None)

mcp_server = MCPServer(
    "tripilot",
    version=get_settings().app_version,
    instructions=(
        "Tripilot remote MCP server for trips, Plan A/B day options, "
        "itinerary items, places/airports lookups, expenses with live FX, "
        "and travel statistics."
    ),
)

_active_session_manager: StreamableHTTPSessionManager | None = None


@asynccontextmanager
async def mcp_lifespan() -> AsyncGenerator[None, None]:
    """Start and cleanly shut down the shared stateless MCP session manager."""
    global _active_session_manager
    # Create a fresh manager per lifespan because run() is single-use across test apps.
    manager = StreamableHTTPSessionManager(
        app=mcp_server._lowlevel_server,
        json_response=True,
        stateless=True,
    )
    async with manager.run():
        _active_session_manager = manager
        try:
            yield
        finally:
            _active_session_manager = None


def _json_text(payload: Any) -> str:
    return json.dumps(payload, ensure_ascii=False, indent=2, default=str)


def _dump_model(schema_cls: Any, obj: Any) -> dict[str, Any]:
    return schema_cls.model_validate(obj).model_dump(mode="json")


def _parse_iso_datetime(raw: str | None) -> datetime | None:
    if raw is None:
        return None
    cleaned = raw.strip()
    if not cleaned:
        return None
    if len(cleaned) == 10:
        parsed_date = date.fromisoformat(cleaned)
        return datetime(
            parsed_date.year, parsed_date.month, parsed_date.day, tzinfo=UTC
        )
    dt = datetime.fromisoformat(cleaned)
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=UTC)


@asynccontextmanager
async def _tool_session(
    scope: str, *, rate_limit_bucket: str | None = None
) -> AsyncIterator[_McpRequestContext]:
    """Enforce PAT scope, optional rate limits, and clean DB rollback on errors."""
    ctx = _mcp_ctx.get()
    if ctx is None:
        raise ToolError("MCP request context unavailable.")
    if not ctx.auth_ctx.has_scope(scope):
        raise MCPError(
            code=_INSUFFICIENT_SCOPE_CODE,
            message=f"Missing required scope: {scope}",
        )
    try:
        if rate_limit_bucket is not None:
            enforce_user_rate_limit(
                ctx.auth_ctx, ctx.settings, bucket=rate_limit_bucket
            )
        yield ctx
    except MCPError:
        raise
    except HTTPException as exc:
        await ctx.db.rollback()
        raise ToolError(str(exc.detail)) from exc
    except ValueError as exc:
        await ctx.db.rollback()
        raise ToolError(str(exc)) from exc
    except Exception as exc:
        await ctx.db.rollback()
        logger.exception("Unhandled MCP tool error (%s)", type(exc).__name__)
        raise ToolError("Unexpected server error while executing tool.") from exc


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
async def list_trips(status: TripStatusLiteral | None = None) -> str:
    """List trips belonging to the authenticated user, optionally filtered by status."""
    async with _tool_session("trips:read") as ctx:
        trips = await TripService(ctx.db).list_trips(ctx.auth_ctx.user.id, status)
        return _json_text([_dump_model(TripSummaryResponse, t) for t in trips])


@mcp_server.tool()
async def get_trip(trip_id: str, day_index: int | None = None) -> str:
    """Get full trip details including all days, Plan A/B options, and items."""
    async with _tool_session("trips:read") as ctx:
        trip = await TripService(ctx.db).get_trip_detail(
            trip_id, ctx.auth_ctx.user.id
        )
        data = _dump_model(TripDetailResponse, trip)
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
        return _json_text(data)


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
    async with _tool_session("trips:write") as ctx:
        payload = TripCreate(
            title=title,
            start_date=date.fromisoformat(start_date),
            end_date=date.fromisoformat(end_date),
            country_codes=[c.upper() for c in country_codes],
            default_currency=default_currency.upper(),
            destination_summary=destination_summary,
        )
        trip = await TripService(ctx.db).create_trip(ctx.auth_ctx.user.id, payload)
        return _json_text(_dump_model(TripDetailResponse, trip))


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
    """Update trip metadata, status, or shift start_date (which shifts all day dates)."""
    async with _tool_session("trips:write") as ctx:
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
        return _json_text(_dump_model(TripDetailResponse, trip))


@mcp_server.tool()
async def delete_trip(trip_id: str) -> str:
    """Delete a trip and all of its days, options, items, shares, and expenses."""
    async with _tool_session("trips:write") as ctx:
        await TripService(ctx.db).delete_trip(trip_id, ctx.auth_ctx.user.id)
        return _json_text({"deleted": True, "trip_id": trip_id})


@mcp_server.tool()
async def append_day(trip_id: str) -> str:
    """Append one new day (with a default Plan A) to the end of a trip."""
    async with _tool_session("trips:write") as ctx:
        day = await TripService(ctx.db).append_day(trip_id, ctx.auth_ctx.user.id)
        return _json_text(_dump_model(TripDayResponse, day))


@mcp_server.tool()
async def update_day_title(
    day_id: str,
    title: str | None = None,
    notes: str | None = None,
) -> str:
    """Set or update a TripDay's theme title or notes."""
    async with _tool_session("trips:write") as ctx:
        fields = {
            k: v
            for k, v in {"title": title, "notes": notes}.items()
            if v is not None
        }
        day = await TripService(ctx.db).update_day(
            day_id, ctx.auth_ctx.user.id, TripDayUpdate(**fields)
        )
        return _json_text(_dump_model(TripDayResponse, day))


@mcp_server.tool()
async def delete_trip_day(day_id: str) -> str:
    """Delete a trip day, unlink its expenses, and re-index remaining days (rejected if sole day)."""
    async with _tool_session("trips:write") as ctx:
        await TripService(ctx.db).delete_day(day_id, ctx.auth_ctx.user.id)
        return _json_text({"deleted": True, "day_id": day_id})


@mcp_server.tool()
async def create_day_option(
    day_id: str,
    label: str,
    clone_from_option_id: str | None = None,
    summary_notes: str | None = None,
) -> str:
    """Create a new Plan B / alternative day option (blank or cloned) on a trip day."""
    async with _tool_session("trips:write") as ctx:
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
        return _json_text(_dump_model(DayOptionResponse, opt))


@mcp_server.tool()
async def clone_day_option(option_id: str, label: str) -> str:
    """Deep-clone an existing Plan A/B day option into a new alternative plan."""
    async with _tool_session("trips:write") as ctx:
        opt = await TripService(ctx.db).clone_day_option(
            option_id, ctx.auth_ctx.user.id, DayOptionCloneRequest(label=label)
        )
        return _json_text(_dump_model(DayOptionResponse, opt))


@mcp_server.tool()
async def rename_day_option(option_id: str, label: str) -> str:
    """Rename an existing day option (e.g. rename Plan A to 'Sunny Outdoor')."""
    async with _tool_session("trips:write") as ctx:
        opt = await TripService(ctx.db).update_day_option(
            option_id, ctx.auth_ctx.user.id, DayOptionUpdate(label=label)
        )
        return _json_text(_dump_model(DayOptionResponse, opt))


@mcp_server.tool()
async def delete_day_option(option_id: str) -> str:
    """Delete a day option (rejected if it is the last remaining option on the day)."""
    async with _tool_session("trips:write") as ctx:
        day = await TripService(ctx.db).delete_day_option(
            option_id, ctx.auth_ctx.user.id
        )
        return _json_text(_dump_model(TripDayResponse, day))


@mcp_server.tool()
async def set_active_option(day_id: str, option_id: str) -> str:
    """Set which Plan A/B day option is active for a trip day."""
    async with _tool_session("trips:write") as ctx:
        day = await TripService(ctx.db).set_active_option(
            day_id, ctx.auth_ctx.user.id, option_id
        )
        return _json_text(_dump_model(TripDayResponse, day))


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
    async with _tool_session("trips:write") as ctx:
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
        return _json_text(_dump_model(ItineraryItemResponse, item))


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
    async with _tool_session("trips:write") as ctx:
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
        return _json_text(_dump_model(ItineraryItemResponse, item))


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
    """Partially update an existing itinerary item (time, coordinates, notes, details, etc.)."""
    async with _tool_session("trips:write") as ctx:
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
        return _json_text(_dump_model(ItineraryItemResponse, item))


@mcp_server.tool()
async def delete_itinerary_item(item_id: str) -> str:
    """Delete an itinerary item by ID."""
    async with _tool_session("trips:write") as ctx:
        await TripService(ctx.db).delete_item(item_id, ctx.auth_ctx.user.id)
        return _json_text({"deleted": True, "item_id": item_id})


@mcp_server.tool()
async def select_choice_item(item_id: str) -> str:
    """Select an alternative item as the active choice within its slot choice group."""
    async with _tool_session("trips:write") as ctx:
        opt = await TripService(ctx.db).select_choice_item(
            item_id, ctx.auth_ctx.user.id
        )
        return _json_text(_dump_model(DayOptionResponse, opt))


@mcp_server.tool()
async def reorder_itinerary_items(option_id: str, item_ids: list[str]) -> str:
    """Reorder all itinerary items within a DayOption and recalculate routes."""
    async with _tool_session("trips:write") as ctx:
        opt = await TripService(ctx.db).reorder_items(
            option_id, ctx.auth_ctx.user.id, item_ids
        )
        return _json_text(_dump_model(DayOptionResponse, opt))


@mcp_server.tool()
async def recalculate_option_route(option_id: str) -> str:
    """Force-refresh cached ground route segments and distance for a DayOption."""
    async with _tool_session("trips:write") as ctx:
        opt = await TripService(ctx.db).recalculate_option_route(
            option_id, ctx.auth_ctx.user.id
        )
        return _json_text(_dump_model(DayOptionResponse, opt))


@mcp_server.tool()
async def list_trip_shares(trip_id: str) -> str:
    """List all read-only share links and their visibility policies for a trip."""
    async with _tool_session("trips:read") as ctx:
        shares = await TripService(ctx.db).list_shares(trip_id, ctx.auth_ctx.user.id)
        return _json_text([_dump_model(TripShareResponse, s) for s in shares])


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
    """Create a read-only share link for a trip with explicit privacy policy controls."""
    async with _tool_session("trips:write") as ctx:
        payload = TripShareCreate(
            label=label,
            visibility_policy=ShareVisibilityPolicy(
                include_booking_refs=include_booking_refs,
                include_notes=include_notes,
                include_expenses=include_expenses,
                include_backup_options=include_backup_options,
            ),
            expires_at=_parse_iso_datetime(expires_at),
        )
        share = await TripService(ctx.db).create_share(
            trip_id, ctx.auth_ctx.user.id, payload
        )
        return _json_text(_dump_model(TripShareResponse, share))


@mcp_server.tool()
async def revoke_trip_share(trip_id: str, share_id: str) -> str:
    """Revoke an existing read-only share link so it can no longer be viewed."""
    async with _tool_session("trips:write") as ctx:
        await TripService(ctx.db).revoke_share(
            trip_id, share_id, ctx.auth_ctx.user.id
        )
        return _json_text({"revoked": True, "share_id": share_id})


@mcp_server.tool()
async def search_places(
    query: str,
    lang: str = "zh-TW",
    limit: int = PLACES_DEFAULT_LIMIT,
) -> str:
    """Geocode places/venues to obtain coordinates, address, and Google Maps link."""
    async with _tool_session("trips:read", rate_limit_bucket="places"):
        clamped_limit = max(1, min(limit, PLACES_MAX_LIMIT))
        provider = get_place_search_provider()
        results = await provider.search(
            query, language=lang, limit=clamped_limit
        )
        return _json_text([asdict(r) for r in results])


@mcp_server.tool()
async def resolve_google_maps_url(url: str) -> str:
    """Resolve a Google Maps URL (full or maps.app.goo.gl) into coordinates."""
    async with _tool_session("trips:read", rate_limit_bucket="places"):
        resolved = await svc_resolve_google_maps_url(url)
        if resolved is None:
            raise ValueError(
                "Could not extract coordinates from the provided Google Maps URL"
            )
        return _json_text(asdict(resolved))


@mcp_server.tool()
async def search_airports(
    query: str,
    limit: int = AIRPORTS_DEFAULT_LIMIT,
) -> str:
    """Search commercial airports by IATA code, city, or airport name."""
    async with _tool_session("trips:read"):
        clamped_limit = max(1, min(limit, AIRPORTS_MAX_LIMIT))
        return _json_text(
            [asdict(a) for a in svc_search_airports(query, limit=clamped_limit)]
        )


@mcp_server.tool()
async def resolve_link_title(url: str) -> str:
    """Resolve a display filename/title from a whitelisted cloud share URL."""
    async with _tool_session("trips:read", rate_limit_bucket="places"):
        title = await fetch_cloud_link_title(url)
        return _json_text({"title": title})


@mcp_server.tool()
async def list_expenses(trip_id: str) -> str:
    """List all expenses and category totals for a trip."""
    async with _tool_session("expenses:read") as ctx:
        summary = await ExpenseService(ctx.db).list_trip_expenses(
            trip_id, ctx.auth_ctx.user
        )
        return _json_text(summary.model_dump(mode="json"))


@mcp_server.tool()
async def add_expense(
    trip_id: str,
    title: str,
    category: ExpenseCategoryLiteral,
    amount_original: float,
    currency_original: str,
    exchange_rate: float | None = None,
    trip_day_id: str | None = None,
    itinerary_item_id: str | None = None,
    paid_at: str | None = None,
    payment_method: str | None = None,
    notes: str | None = None,
) -> str:
    """Record a trip expense (auto-fetches live FX when exchange_rate is omitted)."""
    async with _tool_session("expenses:write") as ctx:
        payload = ExpenseCreate(
            title=title,
            category=ExpenseCategory(category),
            amount_original=Decimal(str(amount_original)),
            currency_original=currency_original.upper(),
            exchange_rate=(
                Decimal(str(exchange_rate))
                if exchange_rate is not None
                else None
            ),
            trip_day_id=trip_day_id,
            itinerary_item_id=itinerary_item_id,
            paid_at=_parse_iso_datetime(paid_at),
            payment_method=payment_method,
            notes=notes,
        )
        created = await ExpenseService(ctx.db).create_expense(
            trip_id, ctx.auth_ctx.user, payload
        )
        return _json_text(_dump_model(ExpenseResponse, created))


@mcp_server.tool()
async def update_expense(
    expense_id: str,
    title: str | None = None,
    category: ExpenseCategoryLiteral | None = None,
    amount_original: float | None = None,
    currency_original: str | None = None,
    exchange_rate: float | None = None,
    trip_day_id: str | None = None,
    itinerary_item_id: str | None = None,
    paid_at: str | None = None,
    payment_method: str | None = None,
    notes: str | None = None,
) -> str:
    """Partially update an expense (auto-refreshes FX if currency changes and exchange_rate is omitted)."""
    async with _tool_session("expenses:write") as ctx:
        raw: dict[str, Any] = {
            "title": title,
            "category": ExpenseCategory(category)
            if category is not None
            else None,
            "amount_original": Decimal(str(amount_original))
            if amount_original is not None
            else None,
            "currency_original": currency_original.upper()
            if currency_original is not None
            else None,
            "exchange_rate": Decimal(str(exchange_rate))
            if exchange_rate is not None
            else None,
            "paid_at": _parse_iso_datetime(paid_at),
            "payment_method": payment_method,
            "notes": notes,
        }
        patch: dict[str, Any] = {k: v for k, v in raw.items() if v is not None}
        if trip_day_id is not None:
            patch["trip_day_id"] = trip_day_id or None
        if itinerary_item_id is not None:
            patch["itinerary_item_id"] = itinerary_item_id or None
        updated = await ExpenseService(ctx.db).update_expense(
            expense_id, ctx.auth_ctx.user, ExpenseUpdate(**patch)
        )
        return _json_text(_dump_model(ExpenseResponse, updated))


@mcp_server.tool()
async def delete_expense(expense_id: str) -> str:
    """Delete an expense record by ID."""
    async with _tool_session("expenses:write") as ctx:
        await ExpenseService(ctx.db).delete_expense(
            expense_id, ctx.auth_ctx.user.id
        )
        return _json_text({"deleted": True, "expense_id": expense_id})


@mcp_server.tool()
async def get_fx_rate(
    from_currency: str,
    to_currency: str = "TWD",
) -> str:
    """Get the cached live exchange rate between two ISO-4217 currency codes."""
    async with _tool_session("expenses:read") as ctx:
        src = from_currency.upper()
        dst = (to_currency or ctx.auth_ctx.user.home_currency).upper()
        rate, source, cached = await get_fx_provider().get_rate(src, dst)
        return _json_text(
            {
                "from_currency": src,
                "to_currency": dst,
                "rate": rate,
                "source": source,
                "cached": cached,
            }
        )


@mcp_server.tool()
async def get_travel_stats(
    year: int | None = None,
    scope: StatsScopeLiteral = "all",
) -> str:
    """Get travel dashboard statistics filtered by optional year and scope (all|domestic|international)."""
    async with _tool_session("stats:read") as ctx:
        stats = await StatsService(ctx.db).get_travel_stats(
            ctx.auth_ctx.user,
            year=year,
            scope=scope,
        )
        return _json_text(stats.model_dump(mode="json"))


async def _dispatch_stateless_mcp(request: Request) -> Response:
    status_code = 200
    response_headers: dict[str, str] = {}
    body_chunks: list[bytes] = []

    async def capture_send(message: Message) -> None:
        nonlocal status_code
        msg_type = message["type"]
        if msg_type == "http.response.start":
            status_code = int(message["status"])
            for raw_name, raw_val in message.get("headers", []):
                name = raw_name.decode("latin-1")
                if name.lower() != "content-length":
                    response_headers[name] = raw_val.decode("latin-1")
        elif msg_type == "http.response.body":
            body_chunks.append(bytes(message.get("body", b"")))

    if _active_session_manager is not None:
        await _active_session_manager.handle_request(
            request.scope, request.receive, capture_send
        )
    else:
        # Support ASGITransport test runs that skip FastAPI lifespan startup.
        ephemeral_manager = StreamableHTTPSessionManager(
            app=mcp_server._lowlevel_server,
            json_response=True,
            stateless=True,
        )
        async with ephemeral_manager.run():
            await ephemeral_manager.handle_request(
                request.scope, request.receive, capture_send
            )

    return Response(
        content=b"".join(body_chunks),
        status_code=status_code,
        headers=response_headers,
    )


@router.post("/mcp")
async def mcp_endpoint(
    request: Request,
    auth_ctx: AuthDep,
    db: DbSession,
    settings: SettingsDep,
) -> Response:
    """Stateless Streamable HTTP MCP transport backed by the official MCP SDK."""
    token = _mcp_ctx.set(
        _McpRequestContext(auth_ctx=auth_ctx, db=db, settings=settings)
    )
    try:
        return await _dispatch_stateless_mcp(request)
    finally:
        _mcp_ctx.reset(token)


_EXCLUDED_GPT_OPENAPI_PREFIXES: tuple[str, ...] = (
    "/api/v1/admin",
    "/api/v1/invites",
    "/api/v1/me",
    "/api/v1/tokens",
    "/api/v1/public",
    "/api/v1/trips/{trip_id}/shares",
)
_HTTP_METHODS = frozenset({"get", "post", "patch", "put", "delete"})
_SCHEMA_REF_PREFIX = "#/components/schemas/"


def _resolve_public_origin(request: Request) -> str:
    base = str(request.base_url).rstrip("/")
    forwarded_proto = (
        request.headers.get("x-forwarded-proto", "").split(",")[0].strip().lower()
    )
    if forwarded_proto == "https" and base.startswith("http://"):
        return "https://" + base[len("http://") :]
    return base


def _collect_schema_refs(node: Any, refs: set[str]) -> None:
    if isinstance(node, dict):
        ref = node.get("$ref")
        if isinstance(ref, str) and ref.startswith(_SCHEMA_REF_PREFIX):
            refs.add(ref[len(_SCHEMA_REF_PREFIX) :])
        for value in node.values():
            _collect_schema_refs(value, refs)
    elif isinstance(node, list):
        for item in node:
            _collect_schema_refs(item, refs)


@router.get(
    "/gpt-openapi.json",
    response_class=JSONResponse,
    include_in_schema=False,
    dependencies=[Depends(limit_public_endpoint("public"))],
)
async def gpt_openapi_schema(
    request: Request,
    settings: SettingsDep,
) -> JSONResponse:
    """Public curated OpenAPI spec for ChatGPT Custom GPT Actions (<= 30 operations)."""
    schema: dict[str, Any] = get_openapi(
        title="Tripilot API",
        version=settings.app_version,
        description=(
            "Personal travel itinerary, route map, place lookup, "
            "and multi-currency expense API."
        ),
        routes=request.app.routes,
    )
    schema["servers"] = [{"url": _resolve_public_origin(request)}]

    raw_paths = schema.get("paths")
    filtered_paths: dict[str, Any] = {}
    used_ids: set[str] = set()
    if isinstance(raw_paths, dict):
        for path, path_item in raw_paths.items():
            if not path.startswith("/api/v1/"):
                continue
            if path.startswith(_EXCLUDED_GPT_OPENAPI_PREFIXES):
                continue
            if not isinstance(path_item, dict):
                continue
            cleaned_item: dict[str, Any] = {}
            for key, value in path_item.items():
                lowered = str(key).lower()
                if lowered not in _HTTP_METHODS or not isinstance(value, dict):
                    cleaned_item[key] = value
                    continue
                op = dict(value)
                raw_op_id = str(op.get("operationId", "operation"))
                candidate = (raw_op_id.split("_api_v1_", 1)[0] or raw_op_id)[:64]
                unique_id = candidate
                suffix = 2
                while unique_id in used_ids:
                    tag = f"_{suffix}"
                    unique_id = f"{candidate[: 64 - len(tag)]}{tag}"
                    suffix += 1
                used_ids.add(unique_id)
                op["operationId"] = unique_id
                op["security"] = [{"HTTPBearer": []}]
                cleaned_item[key] = op
            filtered_paths[path] = cleaned_item

    schema["paths"] = filtered_paths
    schema["security"] = [{"HTTPBearer": []}]

    components = schema.setdefault("components", {})
    if isinstance(components, dict):
        components["securitySchemes"] = {
            "HTTPBearer": {
                "type": "http",
                "scheme": "bearer",
                "description": "Tripilot Personal API Token (tp_pat_...)",
            }
        }
        all_schemas = components.get("schemas")
        if isinstance(all_schemas, dict):
            # Prune unreferenced schemas so excluded admin/account models never leak.
            needed: set[str] = set()
            frontier: set[str] = set()
            _collect_schema_refs(filtered_paths, frontier)
            while frontier:
                name = frontier.pop()
                if name in needed:
                    continue
                needed.add(name)
                target = all_schemas.get(name)
                if target is not None:
                    _collect_schema_refs(target, frontier)
            components["schemas"] = {
                k: v for k, v in all_schemas.items() if k in needed
            }

    return JSONResponse(content=schema)


@router.get(
    "/llms.txt",
    response_class=PlainTextResponse,
    dependencies=[Depends(limit_public_endpoint("public"))],
)
async def llms_txt(request: Request) -> str:
    """Public English guide enabling any AI assistant to discover and operate Tripilot."""
    base = _resolve_public_origin(request)
    return f"""# Tripilot — AI Assistant Integration Guide

Tripilot is a personal travel itinerary, route-map, trip-brief, and expense platform.

## 1. Authentication
Ask the user for their Personal API Token (`tp_pat_...`), created in Tripilot -> Settings -> API Tokens.
Send it on every request as:
`Authorization: Bearer tp_pat_...`

## 2. Option A — Remote MCP (Recommended)
Endpoint: `POST {base}/mcp` (Official Stateless Streamable HTTP / JSON-RPC 2.0)
Headers:
- `Authorization: Bearer <TOKEN>`
- `Content-Type: application/json`
- `Accept: application/json, text/event-stream`

Available MCP tools (33 total):
- Trips & Days: `list_trips`, `get_trip`, `create_trip`, `update_trip`, `delete_trip`, `append_day`, `update_day_title` (`title`, `notes`), `delete_trip_day`
- Day Options & Routes (Plan A/B): `create_day_option`, `clone_day_option`, `rename_day_option`, `delete_day_option`, `set_active_option`, `recalculate_option_route`
- Itinerary Items: `add_itinerary_item` (`type`), `add_item_by_date` (`type`), `update_itinerary_item` (flat fields), `delete_itinerary_item`, `select_choice_item`, `reorder_itinerary_items`
- Share Links: `list_trip_shares`, `create_trip_share`, `revoke_trip_share`
- Places, Airports & Cloud Links: `search_places` (`query`, `lang`, `limit`), `resolve_google_maps_url`, `search_airports` (`query`, `limit`), `resolve_link_title`
- Expenses & FX: `list_expenses`, `add_expense` (omit `exchange_rate` to auto-fetch live FX), `update_expense`, `delete_expense`, `get_fx_rate`
- Dashboard: `get_travel_stats` (supports `year` and `scope`: `all` | `domestic` | `international`)

## 3. Option B — ChatGPT Custom GPT Actions / REST API (OpenAPI)
Base URL: `{base}/api/v1`
OpenAPI Schema (ChatGPT Custom GPT Actions / REST): `{base}/gpt-openapi.json`

Key endpoints:
- `GET /api/v1/trips` — list trips
- `POST /api/v1/trips` — create trip (`title`, `start_date`, `end_date`, `country_codes`, `default_currency`)
- `GET /api/v1/trips/{{trip_id}}` — full trip with days, options, and items
- `PATCH /api/v1/trips/{{trip_id}}` — update trip metadata or shift `start_date` (shifts all day dates and `end_date`)
- `POST /api/v1/trips/{{trip_id}}/days` — append a new day (with default Plan A)
- `PATCH /api/v1/days/{{day_id}}` — set Day Theme (`title`) or `notes`
- `DELETE /api/v1/days/{{day_id}}` — delete a day, unlink its expenses, and re-index remaining days (rejected if sole day)
- `POST /api/v1/options/{{option_id}}/items` — add item (`FLIGHT`, `RESERVED_TRANSIT`, `LOCAL_TRANSIT`, `STAY`, `SPOT`, `FOOD`)
- `PATCH /api/v1/items/{{item_id}}` — update item
- `PATCH /api/v1/items/{{item_id}}/select` — switch active alternative in a choice group
- `GET /api/v1/places/search?q=...&lang=zh-TW` — geocode places before adding items
- `POST /api/v1/places/resolve-url` — resolve Google Maps URL
- `GET /api/v1/fx/rate?from=JPY&to=TWD` — live cached exchange rate
- `POST /api/v1/links/resolve-title` — extract filename from whitelisted cloud links (Google Drive, Dropbox, OneDrive)
- `GET /api/v1/trips/{{trip_id}}/expenses` & `POST /api/v1/trips/{{trip_id}}/expenses` (omit `exchange_rate` for auto live FX)
- `GET /api/v1/stats?year=2026&scope=all|domestic|international`

## 4. Planning Best Practices
1. Always geocode `STAY`, `SPOT`, `FOOD`, and `RESERVED_TRANSIT` items using `search_places` so pins and routes render on the map.
2. For non-English destinations (e.g. Japan, Korea, Europe), populate `details.local_name` with the native-language venue name for 1-tap taxi copy.
3. Attach cloud tickets/PDFs in `details.attachments` as `[{{"name": "Ticket.pdf", "url": "https://drive.google.com/..."}}]`. They automatically appear on cards and in the Trip Brief vault.
4. For `FLIGHT` items, include `details.origin_iata`, `details.dest_iata`, `details.flight_number`, and `details.booking_ref` — Tripilot auto-computes flight distance and pins destination/origin airports.
5. Set a concise Day Theme on each `TripDay` via `update_day_title`, and place `STAY` items on check-in days so Trip Brief automatically computes stay spans and hotel changes.
"""
