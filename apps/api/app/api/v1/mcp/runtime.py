"""Shared MCP server singleton, request context, session guard, and HTTP dispatch."""

import json
import logging
from collections.abc import AsyncGenerator, AsyncIterator
from contextlib import asynccontextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Any, Literal

from fastapi import HTTPException, Request, Response
from mcp import MCPError
from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.server.streamable_http_manager import StreamableHTTPSessionManager
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.types import Message

from app.core.auth import AuthContext
from app.core.config import Settings, get_settings
from app.core.rate_limit import enforce_user_rate_limit

logger = logging.getLogger(__name__)

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
class McpRequestContext:
    """Per-request dependencies bound to the active stateless MCP invocation."""

    auth_ctx: AuthContext
    db: AsyncSession
    settings: Settings


mcp_ctx: ContextVar[McpRequestContext | None] = ContextVar("mcp_ctx", default=None)

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


def json_text(payload: Any) -> str:
    """Serialize a tool result dictionary/list into formatted UTF-8 JSON."""
    return json.dumps(payload, ensure_ascii=False, indent=2, default=str)


def dump_model(schema_cls: Any, obj: Any) -> dict[str, Any]:
    """Validate an ORM entity via a Pydantic schema and dump JSON-safe dict."""
    return schema_cls.model_validate(obj).model_dump(mode="json")


def parse_iso_datetime(raw: str | None) -> datetime | None:
    """Parse a YYYY-MM-DD date or ISO datetime string into UTC datetime."""
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
async def tool_session(
    scope: str, *, rate_limit_bucket: str | None = None
) -> AsyncIterator[McpRequestContext]:
    """Enforce PAT scope, optional rate limits, and clean DB rollback on errors."""
    ctx = mcp_ctx.get()
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


async def dispatch_stateless_mcp(request: Request) -> Response:
    """Forward an ASGI HTTP request to the stateless Streamable HTTP MCP manager."""
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
