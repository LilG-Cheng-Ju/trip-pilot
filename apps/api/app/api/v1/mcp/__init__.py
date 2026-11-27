"""Remote Streamable HTTP MCP server (/mcp) and public English AI guide (/llms.txt)."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.links import fetch_cloud_link_title
from app.api.v1.mcp import tools_itinerary as _tools_itinerary  # noqa: F401
from app.api.v1.mcp import tools_trips as _tools_trips  # noqa: F401
from app.api.v1.mcp import tools_utilities as _tools_utilities  # noqa: F401
from app.api.v1.mcp.discovery import discovery_router
from app.api.v1.mcp.runtime import (
    McpRequestContext,
    dispatch_stateless_mcp,
    mcp_ctx,
    mcp_lifespan,
    mcp_server,
)
from app.core.auth import AuthContext, require_member_auth
from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.services.places import get_place_search_provider

router = APIRouter(tags=["mcp"])

AuthDep = Annotated[AuthContext, Depends(require_member_auth)]
DbSession = Annotated[AsyncSession, Depends(get_db)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


@router.post("/mcp")
async def mcp_endpoint(
    request: Request,
    auth_ctx: AuthDep,
    db: DbSession,
    settings: SettingsDep,
) -> Response:
    """Stateless Streamable HTTP MCP transport backed by the official MCP SDK."""
    token = mcp_ctx.set(
        McpRequestContext(auth_ctx=auth_ctx, db=db, settings=settings)
    )
    try:
        return await dispatch_stateless_mcp(request)
    finally:
        mcp_ctx.reset(token)


router.include_router(discovery_router)

__all__ = [
    "fetch_cloud_link_title",
    "get_place_search_provider",
    "mcp_lifespan",
    "mcp_server",
    "router",
]
