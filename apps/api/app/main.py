"""FastAPI application entrypoint for Tripilot."""

import logging
import re
import uuid
from collections.abc import AsyncGenerator, Awaitable, Callable
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app import models as _models  # noqa: F401
from app.api.v1 import admin as admin_router
from app.api.v1 import airports as airports_router
from app.api.v1 import expenses as expenses_router
from app.api.v1 import fx as fx_router
from app.api.v1 import links as links_router
from app.api.v1 import mcp as mcp_router
from app.api.v1 import me as me_router
from app.api.v1 import places as places_router
from app.api.v1 import public as public_router
from app.api.v1 import stats as stats_router
from app.api.v1 import trips as trips_router
from app.core.config import Settings, get_settings
from app.core.database import Base, engine
from app.core.http_client import close_shared_http_client
from app.core.logging import configure_logging, request_id_ctx

logger = logging.getLogger(__name__)
_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9._-]{1,64}$")


@asynccontextmanager
async def _lifespan(_: FastAPI) -> AsyncGenerator[None, None]:
    settings = get_settings()
    if settings.is_dev and settings.database_url.startswith("sqlite"):
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            # Upgrade existing local dev SQLite DBs cleanly when new columns land.
            item_cols = {
                row[1]
                for row in (
                    await conn.execute(text("PRAGMA table_info(itinerary_items)"))
                ).fetchall()
            }
            if "choice_group_id" not in item_cols:
                await conn.execute(
                    text(
                        "ALTER TABLE itinerary_items "
                        "ADD COLUMN choice_group_id VARCHAR(36)"
                    )
                )
            if "is_selected" not in item_cols:
                await conn.execute(
                    text(
                        "ALTER TABLE itinerary_items "
                        "ADD COLUMN is_selected BOOLEAN NOT NULL DEFAULT 1"
                    )
                )
            user_cols = {
                row[1]
                for row in (
                    await conn.execute(text("PRAGMA table_info(users)"))
                ).fetchall()
            }
            if "role" not in user_cols:
                await conn.execute(
                    text(
                        "ALTER TABLE users "
                        "ADD COLUMN role VARCHAR(16) NOT NULL DEFAULT 'USER'"
                    )
                )
            if "is_active" not in user_cols:
                await conn.execute(
                    text(
                        "ALTER TABLE users "
                        "ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT 1"
                    )
                )
            if "last_login_at" not in user_cols:
                await conn.execute(
                    text("ALTER TABLE users ADD COLUMN last_login_at DATETIME")
                )
    async with mcp_router.mcp_lifespan():
        try:
            yield
        finally:
            await close_shared_http_client()


def create_app(settings_override: Settings | None = None) -> FastAPI:
    """Build and configure the FastAPI application instance."""
    settings = settings_override or get_settings()
    configure_logging(settings.is_dev)

    application = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        openapi_url="/api/v1/openapi.json" if settings.is_dev else None,
        docs_url="/api/v1/docs" if settings.is_dev else None,
        redoc_url="/api/v1/redoc" if settings.is_dev else None,
        lifespan=_lifespan,
    )

    @application.middleware("http")
    async def attach_request_id(
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        incoming = request.headers.get("X-Request-ID", "").strip()
        req_id = (
            incoming if _REQUEST_ID_RE.fullmatch(incoming) else uuid.uuid4().hex[:16]
        )
        token = request_id_ctx.set(req_id)
        try:
            try:
                response = await call_next(request)
            except Exception as exc:
                logger.exception("Unhandled exception: %s", type(exc).__name__)
                response = JSONResponse(
                    status_code=500,
                    content={
                        "detail": "Internal server error",
                        "request_id": req_id,
                    },
                )
            response.headers["X-Request-ID"] = req_id
            return response
        finally:
            request_id_ctx.reset(token)

    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    application.include_router(me_router.router, prefix="/api/v1")
    application.include_router(admin_router.router, prefix="/api/v1")
    application.include_router(trips_router.router, prefix="/api/v1")
    application.include_router(public_router.router, prefix="/api/v1")
    application.include_router(airports_router.router, prefix="/api/v1")
    application.include_router(places_router.router, prefix="/api/v1")
    application.include_router(fx_router.router, prefix="/api/v1")
    application.include_router(links_router.router, prefix="/api/v1")
    application.include_router(expenses_router.router, prefix="/api/v1")
    application.include_router(stats_router.router, prefix="/api/v1")
    application.include_router(mcp_router.router)

    @application.get("/healthz", tags=["system"])
    async def healthz(
        runtime_settings: Annotated[Settings, Depends(get_settings)],
    ) -> dict[str, str]:
        payload = {
            "status": "ok",
            "service": "tripilot-api",
        }
        if runtime_settings.is_dev:
            payload["env"] = runtime_settings.app_env
        return payload

    return application


app = create_app()
