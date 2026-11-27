"""Public discovery endpoints (/gpt-openapi.json and /llms.txt) for AI clients."""
# ruff: noqa: E501

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from fastapi.openapi.utils import get_openapi
from fastapi.responses import JSONResponse, PlainTextResponse

from app.core.config import Settings, get_settings
from app.core.rate_limit import limit_public_endpoint

discovery_router = APIRouter(tags=["mcp"])
SettingsDep = Annotated[Settings, Depends(get_settings)]

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


@discovery_router.get(
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


@discovery_router.get(
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
