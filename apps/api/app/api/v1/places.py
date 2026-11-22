"""Place search and Google Maps URL resolution endpoints."""

from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.services.places import (
    PlaceCandidate,
    get_place_search_provider,
    resolve_google_maps_url,
)

router = APIRouter(tags=["places"])


class PlaceCandidateResponse(BaseModel):
    name: str
    address: str | None
    latitude: float
    longitude: float
    google_maps_url: str | None
    provider: str


class ResolveUrlRequest(BaseModel):
    url: str = Field(min_length=8, max_length=1000)


def _to_response(candidate: PlaceCandidate) -> PlaceCandidateResponse:
    return PlaceCandidateResponse(
        name=candidate.name,
        address=candidate.address,
        latitude=candidate.latitude,
        longitude=candidate.longitude,
        google_maps_url=candidate.google_maps_url,
        provider=candidate.provider,
    )


@router.get("/places/search", response_model=list[PlaceCandidateResponse])
async def search_places(
    q: Annotated[str, Query(min_length=1, max_length=120)],
    lang: Annotated[str, Query(max_length=10)] = "zh-TW",
    limit: Annotated[int, Query(ge=1, le=10)] = 5,
) -> list[PlaceCandidateResponse]:
    """Search places via Google Places API (New) or free Photon OSM fallback."""
    provider = get_place_search_provider()
    try:
        candidates = await provider.search(q.strip(), language=lang, limit=limit)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Place search provider unavailable",
        ) from exc
    return [_to_response(c) for c in candidates]


@router.post("/places/resolve-url", response_model=PlaceCandidateResponse)
async def resolve_place_url(payload: ResolveUrlRequest) -> PlaceCandidateResponse:
    """Resolve a full or shortened Google Maps URL into name and coordinates."""
    resolved = await resolve_google_maps_url(payload.url)
    if resolved is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Could not extract coordinates from the provided Google Maps URL",
        )
    return _to_response(resolved)
