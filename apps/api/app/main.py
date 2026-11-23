"""FastAPI application entrypoint for Tripilot."""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

import app.models  # noqa: F401
from app.api.v1 import airports as airports_router
from app.api.v1 import expenses as expenses_router
from app.api.v1 import fx as fx_router
from app.api.v1 import me as me_router
from app.api.v1 import places as places_router
from app.api.v1 import public as public_router
from app.api.v1 import stats as stats_router
from app.api.v1 import trips as trips_router
from app.core.config import get_settings
from app.core.database import Base, engine


@asynccontextmanager
async def _lifespan(_: FastAPI) -> AsyncGenerator[None, None]:
    settings = get_settings()
    if settings.is_dev and settings.database_url.startswith("sqlite"):
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            # Upgrade existing local dev SQLite DBs cleanly when new columns land.
            cols = {
                row[1]
                for row in (
                    await conn.execute(text("PRAGMA table_info(itinerary_items)"))
                ).fetchall()
            }
            if "choice_group_id" not in cols:
                await conn.execute(
                    text(
                        "ALTER TABLE itinerary_items "
                        "ADD COLUMN choice_group_id VARCHAR(36)"
                    )
                )
            if "is_selected" not in cols:
                await conn.execute(
                    text(
                        "ALTER TABLE itinerary_items "
                        "ADD COLUMN is_selected BOOLEAN NOT NULL DEFAULT 1"
                    )
                )
    yield


def create_app() -> FastAPI:
    """Build and configure the FastAPI application instance."""
    settings = get_settings()

    application = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        openapi_url="/api/v1/openapi.json",
        docs_url="/api/v1/docs",
        redoc_url="/api/v1/redoc",
        lifespan=_lifespan,
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    application.include_router(me_router.router, prefix="/api/v1")
    application.include_router(trips_router.router, prefix="/api/v1")
    application.include_router(public_router.router, prefix="/api/v1")
    application.include_router(airports_router.router, prefix="/api/v1")
    application.include_router(places_router.router, prefix="/api/v1")
    application.include_router(fx_router.router, prefix="/api/v1")
    application.include_router(expenses_router.router, prefix="/api/v1")
    application.include_router(stats_router.router, prefix="/api/v1")

    @application.get("/healthz", tags=["system"])
    async def healthz() -> dict[str, str]:
        return {
            "status": "ok",
            "service": "tripilot-api",
            "env": settings.app_env,
        }

    return application


app = create_app()
