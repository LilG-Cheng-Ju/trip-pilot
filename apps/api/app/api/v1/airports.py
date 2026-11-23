"""Airport autocomplete and Great-Circle lookup endpoints."""

from typing import Annotated

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.core.constants import AIRPORTS_DEFAULT_LIMIT, AIRPORTS_MAX_LIMIT
from app.services.airport_service import search_airports

router = APIRouter(tags=["airports"])


class AirportResponse(BaseModel):
    iata: str
    name: str
    city: str
    country_code: str
    latitude: float
    longitude: float
    timezone: str


@router.get("/airports/search", response_model=list[AirportResponse])
async def search_airports_endpoint(
    q: Annotated[str, Query(max_length=60)] = "",
    limit: Annotated[int, Query(ge=1, le=AIRPORTS_MAX_LIMIT)] = AIRPORTS_DEFAULT_LIMIT,
) -> list[AirportResponse]:
    """Search commercial airports by IATA code, city, or airport name."""
    return [
        AirportResponse(
            iata=a.iata,
            name=a.name,
            city=a.city,
            country_code=a.country_code,
            latitude=a.latitude,
            longitude=a.longitude,
            timezone=a.timezone,
        )
        for a in search_airports(q, limit=limit)
    ]
