"""Annual and lifetime travel statistics aggregation endpoint."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import AuthContext, require_scope
from app.core.constants import STATS_MAX_YEAR, STATS_MIN_YEAR
from app.core.database import get_db
from app.schemas.stats import StatsScope, TravelStatsResponse
from app.services.stats_service import StatsService

router = APIRouter(tags=["stats"])

ReadStatsAuth = Annotated[AuthContext, Depends(require_scope("stats:read"))]
DbSession = Annotated[AsyncSession, Depends(get_db)]


@router.get("/stats", response_model=TravelStatsResponse)
async def get_travel_stats(
    auth_ctx: ReadStatsAuth,
    db: DbSession,
    year: Annotated[int | None, Query(ge=STATS_MIN_YEAR, le=STATS_MAX_YEAR)] = None,
    scope: Annotated[StatsScope, Query()] = "all",
) -> TravelStatsResponse:
    """Aggregate travel metrics across non-archived trips using active day options."""
    return await StatsService(db).get_travel_stats(
        auth_ctx.user, year=year, scope=scope
    )
