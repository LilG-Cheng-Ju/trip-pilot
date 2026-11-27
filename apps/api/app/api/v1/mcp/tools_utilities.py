"""MCP tools for places, airports, cloud links, expenses, live FX, and stats."""

from dataclasses import asdict
from decimal import Decimal
from typing import Any

from app.api.v1.mcp.runtime import (
    ExpenseCategoryLiteral,
    StatsScopeLiteral,
    dump_model,
    json_text,
    mcp_server,
    parse_iso_datetime,
    tool_session,
)
from app.core.constants import (
    AIRPORTS_DEFAULT_LIMIT,
    AIRPORTS_MAX_LIMIT,
    PLACES_DEFAULT_LIMIT,
    PLACES_MAX_LIMIT,
)
from app.models.enums import ExpenseCategory
from app.schemas.expense import ExpenseCreate, ExpenseResponse, ExpenseUpdate
from app.services.airport_service import search_airports as svc_search_airports
from app.services.expense_service import ExpenseService
from app.services.fx_service import get_fx_provider
from app.services.places import resolve_google_maps_url as svc_resolve_google_maps_url
from app.services.stats_service import StatsService


@mcp_server.tool()
async def search_places(
    query: str,
    lang: str = "zh-TW",
    limit: int = PLACES_DEFAULT_LIMIT,
) -> str:
    """Geocode places/venues to obtain coordinates, address, and Google Maps link."""
    import app.api.v1.mcp as mcp_pkg

    async with tool_session("trips:read", rate_limit_bucket="places"):
        clamped_limit = max(1, min(limit, PLACES_MAX_LIMIT))
        provider = mcp_pkg.get_place_search_provider()
        results = await provider.search(
            query, language=lang, limit=clamped_limit
        )
        return json_text([asdict(r) for r in results])


@mcp_server.tool()
async def resolve_google_maps_url(url: str) -> str:
    """Resolve a Google Maps URL (full or maps.app.goo.gl) into coordinates."""
    async with tool_session("trips:read", rate_limit_bucket="places"):
        resolved = await svc_resolve_google_maps_url(url)
        if resolved is None:
            raise ValueError(
                "Could not extract coordinates from the provided Google Maps URL"
            )
        return json_text(asdict(resolved))


@mcp_server.tool()
async def search_airports(
    query: str,
    limit: int = AIRPORTS_DEFAULT_LIMIT,
) -> str:
    """Search commercial airports by IATA code, city, or airport name."""
    async with tool_session("trips:read"):
        clamped_limit = max(1, min(limit, AIRPORTS_MAX_LIMIT))
        return json_text(
            [asdict(a) for a in svc_search_airports(query, limit=clamped_limit)]
        )


@mcp_server.tool()
async def resolve_link_title(url: str) -> str:
    """Resolve a display filename/title from a whitelisted cloud share URL."""
    import app.api.v1.mcp as mcp_pkg

    async with tool_session("trips:read", rate_limit_bucket="places"):
        title = await mcp_pkg.fetch_cloud_link_title(url)
        return json_text({"title": title})


@mcp_server.tool()
async def list_expenses(trip_id: str) -> str:
    """List all expenses and category totals for a trip."""
    async with tool_session("expenses:read") as ctx:
        summary = await ExpenseService(ctx.db).list_trip_expenses(
            trip_id, ctx.auth_ctx.user
        )
        return json_text(summary.model_dump(mode="json"))


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
    async with tool_session("expenses:write") as ctx:
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
            paid_at=parse_iso_datetime(paid_at),
            payment_method=payment_method,
            notes=notes,
        )
        created = await ExpenseService(ctx.db).create_expense(
            trip_id, ctx.auth_ctx.user, payload
        )
        return json_text(dump_model(ExpenseResponse, created))


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
    """Partially update an expense (auto-refreshes FX when currency changes)."""
    async with tool_session("expenses:write") as ctx:
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
            "paid_at": parse_iso_datetime(paid_at),
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
        return json_text(dump_model(ExpenseResponse, updated))


@mcp_server.tool()
async def delete_expense(expense_id: str) -> str:
    """Delete an expense record by ID."""
    async with tool_session("expenses:write") as ctx:
        await ExpenseService(ctx.db).delete_expense(
            expense_id, ctx.auth_ctx.user.id
        )
        return json_text({"deleted": True, "expense_id": expense_id})


@mcp_server.tool()
async def get_fx_rate(
    from_currency: str,
    to_currency: str = "TWD",
) -> str:
    """Get the cached live exchange rate between two ISO-4217 currency codes."""
    async with tool_session("expenses:read") as ctx:
        src = from_currency.upper()
        dst = (to_currency or ctx.auth_ctx.user.home_currency).upper()
        rate, source, cached = await get_fx_provider().get_rate(src, dst)
        return json_text(
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
    """Get travel stats filtered by optional year and scope (all|domestic|intl)."""
    async with tool_session("stats:read") as ctx:
        stats = await StatsService(ctx.db).get_travel_stats(
            ctx.auth_ctx.user,
            year=year,
            scope=scope,
        )
        return json_text(stats.model_dump(mode="json"))
