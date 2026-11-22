"""Pluggable place search (Google Places New + Photon OSM) and Maps URL resolver."""

import re
from dataclasses import dataclass
from typing import Protocol
from urllib.parse import unquote

import httpx

from app.core.config import get_settings

GOOGLE_PLACES_TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
PHOTON_SEARCH_URL = "https://photon.komoot.io/api/"

# Essentials-only field mask keeps Google Places API (New) in the free tier.
GOOGLE_PLACES_FIELD_MASK = (
    "places.displayName,places.formattedAddress,"
    "places.location,places.googleMapsUri"
)

_AT_COORDS_RE = re.compile(r"@(-?\d+\.\d+),(-?\d+\.\d+)")
_DATA_COORDS_RE = re.compile(r"!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)")
_PLACE_NAME_RE = re.compile(r"/maps/place/([^/@?]+)")


@dataclass(frozen=True)
class PlaceCandidate:
    """Standardized place search or URL resolution result."""

    name: str
    address: str | None
    latitude: float
    longitude: float
    google_maps_url: str | None
    provider: str


class PlaceSearchProvider(Protocol):
    """Protocol for place search engines (Google Places, Photon OSM, etc.)."""

    async def search(
        self, query: str, language: str = "zh-TW", limit: int = 5
    ) -> list[PlaceCandidate]: ...


class GooglePlacesProvider:
    """Google Places API (New) text search using Essentials field mask."""

    def __init__(self, api_key: str, timeout_sec: float = 5.0) -> None:
        self.api_key = api_key
        self.timeout_sec = timeout_sec

    async def search(
        self, query: str, language: str = "zh-TW", limit: int = 5
    ) -> list[PlaceCandidate]:
        headers = {
            "X-Goog-Api-Key": self.api_key,
            "X-Goog-FieldMask": GOOGLE_PLACES_FIELD_MASK,
            "Content-Type": "application/json",
        }
        body = {
            "textQuery": query,
            "languageCode": language,
            "pageSize": min(limit, 10),
        }
        async with httpx.AsyncClient(timeout=self.timeout_sec) as client:
            response = await client.post(
                GOOGLE_PLACES_TEXT_SEARCH_URL, headers=headers, json=body
            )
            response.raise_for_status()
            data = response.json()

        results: list[PlaceCandidate] = []
        for place in data.get("places") or []:
            loc = place.get("location") or {}
            lat = loc.get("latitude")
            lng = loc.get("longitude")
            if lat is None or lng is None:
                continue
            display = place.get("displayName") or {}
            results.append(
                PlaceCandidate(
                    name=str(display.get("text") or query),
                    address=place.get("formattedAddress"),
                    latitude=float(lat),
                    longitude=float(lng),
                    google_maps_url=place.get("googleMapsUri"),
                    provider="google_places",
                )
            )
        return results[:limit]


class PhotonOsmProvider:
    """Zero-cost OpenStreetMap Photon fallback when no Google API key is configured."""

    def __init__(self, timeout_sec: float = 5.0) -> None:
        self.timeout_sec = timeout_sec

    async def search(
        self, query: str, language: str = "zh-TW", limit: int = 5
    ) -> list[PlaceCandidate]:
        del language
        async with httpx.AsyncClient(timeout=self.timeout_sec) as client:
            response = await client.get(
                PHOTON_SEARCH_URL, params={"q": query, "limit": limit}
            )
            response.raise_for_status()
            data = response.json()

        results: list[PlaceCandidate] = []
        for feat in data.get("features") or []:
            coords = (feat.get("geometry") or {}).get("coordinates") or []
            if len(coords) < 2:
                continue
            lng, lat = float(coords[0]), float(coords[1])
            props = feat.get("properties") or {}
            name = props.get("name") or props.get("street") or query
            addr_parts = [
                props.get("country"),
                props.get("city") or props.get("state"),
                props.get("street"),
            ]
            address = ", ".join(str(p) for p in addr_parts if p) or None
            results.append(
                PlaceCandidate(
                    name=str(name),
                    address=address,
                    latitude=lat,
                    longitude=lng,
                    google_maps_url=(
                        f"https://www.google.com/maps/search/?api=1&query={lat},{lng}"
                    ),
                    provider="photon_osm",
                )
            )
        return results[:limit]


def get_place_search_provider() -> PlaceSearchProvider:
    """Select Google Places API (New) when configured, else free Photon OSM."""
    api_key = get_settings().google_places_api_key
    if api_key:
        return GooglePlacesProvider(api_key=api_key)
    return PhotonOsmProvider()


def parse_google_maps_url(url: str) -> PlaceCandidate | None:
    """Extract coordinates and optional place name directly from a Google Maps URL."""
    coords_match = _DATA_COORDS_RE.search(url) or _AT_COORDS_RE.search(url)
    if not coords_match:
        return None

    lat = float(coords_match.group(1))
    lng = float(coords_match.group(2))
    name_match = _PLACE_NAME_RE.search(url)
    raw_name = (
        unquote(name_match.group(1)).replace("+", " ") if name_match else "Pinned Spot"
    )
    return PlaceCandidate(
        name=raw_name,
        address=None,
        latitude=lat,
        longitude=lng,
        google_maps_url=url,
        provider="google_maps_url",
    )


async def resolve_google_maps_url(
    url: str, timeout_sec: float = 5.0
) -> PlaceCandidate | None:
    """Resolve short (maps.app.goo.gl) or full Google Maps links into coordinates."""
    cleaned = url.strip()
    parsed = parse_google_maps_url(cleaned)
    if parsed is not None:
        return parsed

    if not cleaned.startswith(("https://", "http://")):
        return None

    try:
        async with httpx.AsyncClient(
            timeout=timeout_sec, follow_redirects=True
        ) as client:
            response = await client.get(cleaned)
        final_url = str(response.url)
        return parse_google_maps_url(final_url)
    except Exception:
        return None
