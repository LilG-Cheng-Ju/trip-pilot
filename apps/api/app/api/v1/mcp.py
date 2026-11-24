"""Remote Streamable HTTP MCP server (/mcp) and public English AI guide (/llms.txt)."""
# ruff: noqa: E501

import json
from dataclasses import asdict
from datetime import date
from decimal import Decimal
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request, Response, status
from fastapi.responses import JSONResponse, PlainTextResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.expenses import create_expense as api_create_expense
from app.api.v1.expenses import list_trip_expenses as api_list_trip_expenses
from app.api.v1.stats import get_travel_stats
from app.core.auth import AuthContext, get_auth_context
from app.core.config import get_settings
from app.core.database import get_db
from app.schemas.expense import ExpenseCreate
from app.schemas.trip import (
    DayOptionCloneRequest,
    ItineraryItemCreate,
    ItineraryItemUpdate,
    TripCreate,
    TripDayUpdate,
)
from app.services.fx_service import get_fx_provider
from app.services.places import get_place_search_provider, resolve_google_maps_url
from app.services.trip_service import TripService

router = APIRouter(tags=["mcp"])

AuthDep = Annotated[AuthContext, Depends(get_auth_context)]
DbSession = Annotated[AsyncSession, Depends(get_db)]

MCP_PROTOCOL_VERSION = "2025-03-26"

_TOOL_SCOPES: dict[str, str] = {
    "list_trips": "trips:read",
    "get_trip": "trips:read",
    "create_trip": "trips:write",
    "update_day_title": "trips:write",
    "add_itinerary_item": "trips:write",
    "update_itinerary_item": "trips:write",
    "delete_itinerary_item": "trips:write",
    "select_choice_item": "trips:write",
    "clone_day_option": "trips:write",
    "search_places": "trips:read",
    "resolve_google_maps_url": "trips:read",
    "list_expenses": "expenses:read",
    "add_expense": "expenses:write",
    "get_fx_rate": "expenses:read",
    "get_travel_stats": "stats:read",
}

_TOOL_DEFINITIONS: list[dict[str, Any]] = [
    {
        "name": "list_trips",
        "description": "List all trips belonging to the authenticated user.",
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "get_trip",
        "description": "Get full trip details including all days, Plan A/B options, and items.",
        "inputSchema": {
            "type": "object",
            "properties": {"trip_id": {"type": "string"}},
            "required": ["trip_id"],
        },
    },
    {
        "name": "create_trip",
        "description": "Create a new trip (automatically scaffolds Day 1..N with Plan A).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "start_date": {"type": "string", "description": "YYYY-MM-DD"},
                "end_date": {"type": "string", "description": "YYYY-MM-DD"},
                "country_codes": {"type": "array", "items": {"type": "string"}},
                "default_currency": {"type": "string", "default": "JPY"},
                "destination_summary": {"type": "string"},
            },
            "required": ["title", "start_date", "end_date", "country_codes"],
        },
    },
    {
        "name": "update_day_title",
        "description": "Set or update the Day Theme / focus headline for a specific TripDay.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "day_id": {"type": "string"},
                "title": {"type": ["string", "null"]},
            },
            "required": ["day_id", "title"],
        },
    },
    {
        "name": "add_itinerary_item",
        "description": (
            "Add an itinerary item (FLIGHT, RESERVED_TRANSIT, LOCAL_TRANSIT, STAY, SPOT, FOOD) "
            "to a day option. Supports details.local_name, details.attachments ([{name,url}]), "
            "and alternative_for_item_id for slot-level choices."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "option_id": {"type": "string"},
                "type": {
                    "type": "string",
                    "enum": [
                        "FLIGHT",
                        "RESERVED_TRANSIT",
                        "LOCAL_TRANSIT",
                        "STAY",
                        "SPOT",
                        "FOOD",
                    ],
                },
                "title": {"type": "string"},
                "start_time": {"type": "string"},
                "end_time": {"type": "string"},
                "address": {"type": "string"},
                "latitude": {"type": "number"},
                "longitude": {"type": "number"},
                "google_maps_url": {"type": "string"},
                "notes": {"type": "string"},
                "details": {"type": "object"},
                "alternative_for_item_id": {"type": "string"},
            },
            "required": ["option_id", "type", "title"],
        },
    },
    {
        "name": "update_itinerary_item",
        "description": "Partially update an existing itinerary item.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "item_id": {"type": "string"},
                "title": {"type": "string"},
                "start_time": {"type": "string"},
                "end_time": {"type": "string"},
                "address": {"type": "string"},
                "latitude": {"type": "number"},
                "longitude": {"type": "number"},
                "google_maps_url": {"type": "string"},
                "notes": {"type": "string"},
                "details": {"type": "object"},
            },
            "required": ["item_id"],
        },
    },
    {
        "name": "delete_itinerary_item",
        "description": "Delete an itinerary item by ID.",
        "inputSchema": {
            "type": "object",
            "properties": {"item_id": {"type": "string"}},
            "required": ["item_id"],
        },
    },
    {
        "name": "select_choice_item",
        "description": "Switch the active choice inside a slot-level multi-choice group.",
        "inputSchema": {
            "type": "object",
            "properties": {"item_id": {"type": "string"}},
            "required": ["item_id"],
        },
    },
    {
        "name": "clone_day_option",
        "description": "Clone a day option into a new Plan B / alternative day plan.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "option_id": {"type": "string"},
                "label": {"type": "string"},
            },
            "required": ["option_id", "label"],
        },
    },
    {
        "name": "search_places",
        "description": "Search real places via Google Places (New) / Photon to get coordinates and Maps URLs.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "lang": {"type": "string", "default": "zh-TW"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "resolve_google_maps_url",
        "description": "Resolve a Google Maps share URL into coordinates, address, and place name.",
        "inputSchema": {
            "type": "object",
            "properties": {"url": {"type": "string"}},
            "required": ["url"],
        },
    },
    {
        "name": "list_expenses",
        "description": "List all expenses and category totals for a trip.",
        "inputSchema": {
            "type": "object",
            "properties": {"trip_id": {"type": "string"}},
            "required": ["trip_id"],
        },
    },
    {
        "name": "add_expense",
        "description": "Record a trip expense (optionally linked to a trip_day_id and itinerary_item_id).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "trip_id": {"type": "string"},
                "title": {"type": "string"},
                "category": {
                    "type": "string",
                    "enum": [
                        "FLIGHT",
                        "LODGING",
                        "TRANSIT",
                        "FOOD",
                        "ACTIVITY",
                        "SHOPPING",
                        "OTHER",
                    ],
                },
                "amount_original": {"type": "number"},
                "currency_original": {"type": "string"},
                "exchange_rate": {"type": "number"},
                "trip_day_id": {"type": "string"},
                "itinerary_item_id": {"type": "string"},
                "payment_method": {"type": "string"},
                "notes": {"type": "string"},
            },
            "required": ["trip_id", "title", "category", "amount_original", "currency_original"],
        },
    },
    {
        "name": "get_fx_rate",
        "description": "Get the cached live exchange rate between two ISO-4217 currency codes.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "from_currency": {"type": "string"},
                "to_currency": {"type": "string", "default": "TWD"},
            },
            "required": ["from_currency"],
        },
    },
    {
        "name": "get_travel_stats",
        "description": "Get travel dashboard statistics filtered by optional year and scope (all|domestic|international).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "year": {"type": "integer"},
                "scope": {
                    "type": "string",
                    "enum": ["all", "domestic", "international"],
                    "default": "all",
                },
            },
        },
    },
]


def _jsonrpc_ok(req_id: Any, result: Any) -> JSONResponse:
    return JSONResponse({"jsonrpc": "2.0", "id": req_id, "result": result})


def _jsonrpc_err(req_id: Any, code: int, message: str) -> JSONResponse:
    return JSONResponse(
        {"jsonrpc": "2.0", "id": req_id, "error": {"code": code, "message": message}}
    )


async def _dispatch_tool(
    name: str,
    args: dict[str, Any],
    auth_ctx: AuthContext,
    db: AsyncSession,
) -> Any:
    required_scope = _TOOL_SCOPES.get(name)
    if required_scope is None:
        raise KeyError(f"Unknown tool: {name}")
    if not auth_ctx.has_scope(required_scope):
        raise PermissionError(f"Missing required scope: {required_scope}")

    trip_svc = TripService(db)
    user_id = auth_ctx.user.id

    if name == "list_trips":
        trips = await trip_svc.list_trips(user_id)
        return [
            {
                "id": t.id,
                "title": t.title,
                "status": t.status,
                "start_date": t.start_date.isoformat(),
                "end_date": t.end_date.isoformat(),
                "country_codes": t.country_codes,
                "default_currency": t.default_currency,
            }
            for t in trips
        ]

    if name == "get_trip":
        trip = await trip_svc.get_trip_detail(str(args["trip_id"]), user_id)
        return {
            "id": trip.id,
            "title": trip.title,
            "start_date": trip.start_date.isoformat(),
            "end_date": trip.end_date.isoformat(),
            "country_codes": trip.country_codes,
            "default_currency": trip.default_currency,
            "days": [
                {
                    "id": d.id,
                    "day_index": d.day_index,
                    "date": d.date.isoformat(),
                    "title": d.title,
                    "active_option_id": d.active_option_id,
                    "options": [
                        {
                            "id": opt.id,
                            "label": opt.label,
                            "cached_ground_distance_km": opt.cached_ground_distance_km,
                            "items": [
                                {
                                    "id": it.id,
                                    "type": it.type,
                                    "title": it.title,
                                    "start_time": it.start_time,
                                    "end_time": it.end_time,
                                    "address": it.address,
                                    "latitude": it.latitude,
                                    "longitude": it.longitude,
                                    "google_maps_url": it.google_maps_url,
                                    "notes": it.notes,
                                    "details": it.details,
                                    "choice_group_id": it.choice_group_id,
                                    "is_selected": it.is_selected,
                                }
                                for it in opt.items
                            ],
                        }
                        for opt in d.options
                    ],
                }
                for d in trip.days
            ],
        }

    if name == "create_trip":
        payload = TripCreate(
            title=str(args["title"]),
            start_date=date.fromisoformat(str(args["start_date"])),
            end_date=date.fromisoformat(str(args["end_date"])),
            country_codes=[str(c).upper() for c in args["country_codes"]],
            default_currency=str(args.get("default_currency", "JPY")).upper(),
            destination_summary=args.get("destination_summary"),
        )
        trip = await trip_svc.create_trip(user_id, payload)
        return {"id": trip.id, "title": trip.title, "days_count": len(trip.days)}

    if name == "update_day_title":
        day = await trip_svc.update_day(
            str(args["day_id"]), user_id, TripDayUpdate(title=args.get("title"))
        )
        return {"id": day.id, "day_index": day.day_index, "title": day.title}

    if name == "add_itinerary_item":
        option_id = str(args["option_id"])
        item_fields = {k: v for k, v in args.items() if k != "option_id"}
        item = await trip_svc.add_item(
            option_id, user_id, ItineraryItemCreate(**item_fields)
        )
        return {"id": item.id, "title": item.title, "type": item.type}

    if name == "update_itinerary_item":
        item_id = str(args["item_id"])
        patch_fields = {k: v for k, v in args.items() if k != "item_id"}
        item = await trip_svc.update_item(
            item_id, user_id, ItineraryItemUpdate(**patch_fields)
        )
        return {"id": item.id, "title": item.title, "details": item.details}

    if name == "delete_itinerary_item":
        await trip_svc.delete_item(str(args["item_id"]), user_id)
        return {"deleted": True, "item_id": str(args["item_id"])}

    if name == "select_choice_item":
        opt = await trip_svc.select_choice_item(str(args["item_id"]), user_id)
        return {
            "option_id": opt.id,
            "cached_ground_distance_km": opt.cached_ground_distance_km,
        }

    if name == "clone_day_option":
        opt = await trip_svc.clone_day_option(
            str(args["option_id"]),
            user_id,
            DayOptionCloneRequest(label=str(args["label"])),
        )
        return {"id": opt.id, "label": opt.label}

    if name == "search_places":
        provider = get_place_search_provider()
        results = await provider.search(
            str(args["query"]), language=str(args.get("lang", "zh-TW"))
        )
        return [asdict(r) for r in results]

    if name == "resolve_google_maps_url":
        resolved = await resolve_google_maps_url(str(args["url"]))
        if resolved is None:
            raise ValueError(
                "Could not extract coordinates from the provided Google Maps URL"
            )
        return asdict(resolved)

    if name == "list_expenses":
        summary = await api_list_trip_expenses(str(args["trip_id"]), auth_ctx, db)
        return summary.model_dump(mode="json")

    if name == "add_expense":
        trip_id = str(args["trip_id"])
        src_cur = str(args["currency_original"]).upper()
        home_cur = auth_ctx.user.home_currency.upper()
        rate_val = args.get("exchange_rate")
        if rate_val is None:
            rate_val, _, _ = await get_fx_provider().get_rate(src_cur, home_cur)
        payload = ExpenseCreate(
            title=str(args["title"]),
            category=args["category"],
            amount_original=Decimal(str(args["amount_original"])),
            currency_original=src_cur,
            exchange_rate=Decimal(str(rate_val)),
            trip_day_id=args.get("trip_day_id"),
            itinerary_item_id=args.get("itinerary_item_id"),
            payment_method=args.get("payment_method"),
            notes=args.get("notes"),
        )
        created = await api_create_expense(trip_id, payload, auth_ctx, db)
        return {
            "id": created.id,
            "title": created.title,
            "amount_home": str(created.amount_home),
            "currency_home": created.currency_home,
        }

    if name == "get_fx_rate":
        src = str(args["from_currency"]).upper()
        dst = str(args.get("to_currency") or auth_ctx.user.home_currency).upper()
        rate, source, cached = await get_fx_provider().get_rate(src, dst)
        return {
            "from_currency": src,
            "to_currency": dst,
            "rate": rate,
            "source": source,
            "cached": cached,
        }

    if name == "get_travel_stats":
        stats = await get_travel_stats(
            auth_ctx=auth_ctx,
            db=db,
            year=args.get("year"),
            scope=args.get("scope", "all"),
        )
        return stats.model_dump(mode="json")

    raise KeyError(f"Unknown tool: {name}")


@router.post("/mcp")
async def mcp_streamable_http(
    request: Request,
    auth_ctx: AuthDep,
    db: DbSession,
) -> Response:
    """Remote Streamable HTTP MCP endpoint authenticated via Personal API Token."""
    try:
        body = await request.json()
    except Exception:
        return _jsonrpc_err(None, -32700, "Parse error")

    method = body.get("method")
    req_id = body.get("id")
    params = body.get("params") or {}

    if method == "initialize":
        base = str(request.base_url).rstrip("/")
        return _jsonrpc_ok(
            req_id,
            {
                "protocolVersion": MCP_PROTOCOL_VERSION,
                "capabilities": {"tools": {}},
                "serverInfo": {
                    "name": "tripilot",
                    "version": get_settings().app_version,
                },
                "instructions": (
                    "Tripilot travel planning MCP server. Always geocode STAY/SPOT/FOOD/RESERVED_TRANSIT "
                    "items via search_places, set details.local_name for non-English venues, attach cloud "
                    "files in details.attachments as [{name, url}], and use get_fx_rate before add_expense. "
                    f"Full reference: {base}/llms.txt"
                ),
            },
        )

    if method in {"notifications/initialized", "notifications/cancelled"}:
        return Response(status_code=status.HTTP_202_ACCEPTED)

    if method == "ping":
        return _jsonrpc_ok(req_id, {})

    if method == "tools/list":
        return _jsonrpc_ok(req_id, {"tools": _TOOL_DEFINITIONS})

    if method == "tools/call":
        tool_name = params.get("name")
        tool_args = params.get("arguments") or {}
        if not isinstance(tool_name, str):
            return _jsonrpc_err(req_id, -32602, "Missing tool name")
        try:
            result = await _dispatch_tool(tool_name, tool_args, auth_ctx, db)
            return _jsonrpc_ok(
                req_id,
                {
                    "content": [
                        {
                            "type": "text",
                            "text": json.dumps(result, ensure_ascii=False, indent=2),
                        }
                    ],
                    "isError": False,
                },
            )
        except KeyError as exc:
            return _jsonrpc_err(req_id, -32601, str(exc))
        except PermissionError as exc:
            return _jsonrpc_err(req_id, -32003, str(exc))
        except Exception as exc:
            return _jsonrpc_ok(
                req_id,
                {
                    "content": [{"type": "text", "text": f"Error: {exc}"}],
                    "isError": True,
                },
            )

    return _jsonrpc_err(req_id, -32601, f"Method not found: {method}")


@router.get("/llms.txt", response_class=PlainTextResponse)
async def llms_txt(request: Request) -> str:
    """Public English guide enabling any AI assistant to discover and operate Tripilot."""
    base = str(request.base_url).rstrip("/")
    return f"""# Tripilot — AI Assistant Integration Guide

Tripilot is a personal travel itinerary, route-map, trip-brief, and expense platform.

## 1. Authentication
Ask the user for their Personal API Token (`tp_pat_...`), created in Tripilot -> Settings -> API Tokens.
Send it on every request as:
`Authorization: Bearer tp_pat_...`

## 2. Option A — Remote MCP (Recommended)
Endpoint: `POST {base}/mcp` (Streamable HTTP / JSON-RPC 2.0)
Headers:
- `Authorization: Bearer <TOKEN>`
- `Content-Type: application/json`

Available MCP tools:
- Trips & Days: `list_trips`, `get_trip`, `create_trip`, `update_day_title`, `clone_day_option`
- Itinerary Items: `add_itinerary_item`, `update_itinerary_item`, `delete_itinerary_item`, `select_choice_item`
- Places: `search_places`, `resolve_google_maps_url`
- Expenses & FX: `list_expenses`, `add_expense`, `get_fx_rate`
- Dashboard: `get_travel_stats` (supports `year` and `scope`: `all` | `domestic` | `international`)

## 3. Option B — REST API (OpenAPI)
Base URL: `{base}/api/v1`
OpenAPI Schema: `{base}/api/v1/openapi.json`

Key endpoints:
- `GET /api/v1/trips` — list trips
- `POST /api/v1/trips` — create trip (`title`, `start_date`, `end_date`, `country_codes`, `default_currency`)
- `GET /api/v1/trips/{{trip_id}}` — full trip with days, options, and items
- `PATCH /api/v1/days/{{day_id}}` — set Day Theme (`title`)
- `POST /api/v1/options/{{option_id}}/items` — add item (`FLIGHT`, `RESERVED_TRANSIT`, `LOCAL_TRANSIT`, `STAY`, `SPOT`, `FOOD`)
- `PATCH /api/v1/items/{{item_id}}` — update item
- `PATCH /api/v1/items/{{item_id}}/select` — switch active alternative in a choice group
- `GET /api/v1/places/search?q=...&lang=zh-TW` — geocode places before adding items
- `POST /api/v1/places/resolve-url` — resolve Google Maps URL
- `GET /api/v1/fx/rate?from=JPY&to=TWD` — live cached exchange rate
- `POST /api/v1/links/resolve-title` — extract filename from whitelisted cloud links (Google Drive, Dropbox, OneDrive)
- `GET /api/v1/trips/{{trip_id}}/expenses` & `POST /api/v1/trips/{{trip_id}}/expenses`
- `GET /api/v1/stats?year=2026&scope=all|domestic|international`

## 4. Planning Best Practices
1. Always geocode `STAY`, `SPOT`, `FOOD`, and `RESERVED_TRANSIT` items using `search_places` so pins and routes render on the map.
2. For non-English destinations (e.g. Japan, Korea, Europe), populate `details.local_name` with the native-language venue name for 1-tap taxi copy.
3. Attach cloud tickets/PDFs in `details.attachments` as `[{{"name": "Ticket.pdf", "url": "https://drive.google.com/..."}}]`. They automatically appear on cards and in the Trip Brief vault.
4. For `FLIGHT` items, include `details.origin_iata`, `details.dest_iata`, `details.flight_number`, and `details.booking_ref` — Tripilot auto-computes flight distance and pins destination/origin airports.
5. Set a concise Day Theme on each `TripDay` via `update_day_title`, and place `STAY` items on check-in days so Trip Brief automatically computes stay spans and hotel changes.
"""
