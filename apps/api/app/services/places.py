"""Pluggable place search (Google Places New + Photon OSM) and Maps URL resolver."""

import re
from dataclasses import dataclass
from typing import Protocol
from urllib.parse import unquote, urljoin, urlparse

from app.core.config import get_settings
from app.core.constants import (
    PLACES_DEFAULT_LIMIT,
    PLACES_HTTP_TIMEOUT_SEC,
    PLACES_MAX_LIMIT,
    PLACES_MAX_REDIRECTS,
)
from app.core.http_client import get_shared_http_client, request_with_resilience

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
_GOOGLE_HOST_RE = re.compile(r"^(www\.|maps\.)?google\.[a-z]{2,3}(\.[a-z]{2})?$")
_ALLOWED_SHORT_HOSTS: frozenset[str] = frozenset({"maps.app.goo.gl", "goo.gl"})


def is_allowed_google_maps_url(url: str) -> bool:
    """Strictly allowlist Google Maps hostnames to prevent SSRF."""
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        return False
    host = (parsed.hostname or "").lower()
    if not host:
        return False
    return host in _ALLOWED_SHORT_HOSTS or bool(_GOOGLE_HOST_RE.match(host))


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
        self, query: str, language: str = "zh-TW", limit: int = PLACES_DEFAULT_LIMIT
    ) -> list[PlaceCandidate]: ...


class GooglePlacesProvider:
    """Google Places API (New) text search using Essentials field mask."""

    def __init__(
        self, api_key: str, timeout_sec: float = PLACES_HTTP_TIMEOUT_SEC
    ) -> None:
        self.api_key = api_key
        self.timeout_sec = timeout_sec

    async def search(
        self, query: str, language: str = "zh-TW", limit: int = PLACES_DEFAULT_LIMIT
    ) -> list[PlaceCandidate]:
        headers = {
            "X-Goog-Api-Key": self.api_key,
            "X-Goog-FieldMask": GOOGLE_PLACES_FIELD_MASK,
            "Content-Type": "application/json",
        }
        body = {
            "textQuery": query,
            "languageCode": language,
            "pageSize": min(limit, PLACES_MAX_LIMIT),
        }
        response = await request_with_resilience(
            "google_places",
            "POST",
            GOOGLE_PLACES_TEXT_SEARCH_URL,
            headers=headers,
            json=body,
            timeout=self.timeout_sec,
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

    def __init__(self, timeout_sec: float = PLACES_HTTP_TIMEOUT_SEC) -> None:
        self.timeout_sec = timeout_sec

    async def search(
        self, query: str, language: str = "zh-TW", limit: int = PLACES_DEFAULT_LIMIT
    ) -> list[PlaceCandidate]:
        del language
        response = await request_with_resilience(
            "photon_osm",
            "GET",
            PHOTON_SEARCH_URL,
            params={"q": query, "limit": limit},
            timeout=self.timeout_sec,
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
    url: str,
    timeout_sec: float = PLACES_HTTP_TIMEOUT_SEC,
    max_redirects: int = PLACES_MAX_REDIRECTS,
) -> PlaceCandidate | None:
    """Resolve short (maps.app.goo.gl) or full Google Maps links safely."""
    cleaned = url.strip()
    if not is_allowed_google_maps_url(cleaned):
        return None

    parsed = parse_google_maps_url(cleaned)
    if parsed is not None:
        return parsed

    # Follow redirects manually via streaming so hops do not download HTML bodies.
    current_url = cleaned
    try:
        client = get_shared_http_client()
        for _ in range(max_redirects):
            if not is_allowed_google_maps_url(current_url):
                return None
            async with client.stream(
                "GET",
                current_url,
                timeout=timeout_sec,
                follow_redirects=False,
            ) as response:
                if response.is_redirect and "location" in response.headers:
                    next_url = urljoin(current_url, response.headers["location"])
                    if not is_allowed_google_maps_url(next_url):
                        return None
                    resolved = parse_google_maps_url(next_url)
                    if resolved is not None:
                        return resolved
                    current_url = next_url
                    continue
                return parse_google_maps_url(str(response.url))
    except Exception:
        return None
    return None
