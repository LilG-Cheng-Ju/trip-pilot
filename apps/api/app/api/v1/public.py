"""Unauthenticated public read-only share routes."""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.rate_limit import limit_public_endpoint
from app.schemas.trip import PublicTripResponse
from app.services.trip_service import TripService

router = APIRouter(tags=["public"])

DbSession = Annotated[AsyncSession, Depends(get_db)]


@router.get(
    "/public/trips/{share_token}",
    response_model=PublicTripResponse,
    dependencies=[Depends(limit_public_endpoint("public"))],
)
async def get_public_trip(
    share_token: str,
    db: DbSession,
) -> PublicTripResponse:
    """Return a privacy-filtered read-only trip snapshot for a valid share token."""
    return await TripService(db).get_public_trip(share_token)
