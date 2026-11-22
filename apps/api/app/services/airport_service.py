"""Offline IATA airport lookup and Great-Circle distance calculations."""

import json
import math
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

EARTH_RADIUS_KM = 6371.0088


@dataclass(frozen=True)
class AirportEntry:
    """In-memory airport metadata entry."""

    iata: str
    name: str
    city: str
    country_code: str
    latitude: float
    longitude: float
    timezone: str


@lru_cache
def _load_airports() -> dict[str, AirportEntry]:
    data_path = Path(__file__).resolve().parents[1] / "data" / "airports.json"
    raw = json.loads(data_path.read_text(encoding="utf-8"))
    return {
        entry["iata"].upper(): AirportEntry(
            iata=entry["iata"].upper(),
            name=entry["name"],
            city=entry["city"],
            country_code=entry["country_code"].upper(),
            latitude=float(entry["latitude"]),
            longitude=float(entry["longitude"]),
            timezone=entry["timezone"],
        )
        for entry in raw
    }


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Compute Great-Circle distance in kilometers between two WGS84 points."""
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lng2 - lng1)

    a = (
        math.sin(d_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return round(EARTH_RADIUS_KM * c, 2)


def get_airport(iata: str) -> AirportEntry | None:
    """Look up an airport by its 3-letter IATA code."""
    return _load_airports().get(iata.strip().upper())


def compute_flight_distance_km(origin_iata: str, dest_iata: str) -> float | None:
    """Compute Great-Circle flight distance in km when both IATA codes are known."""
    origin = get_airport(origin_iata)
    dest = get_airport(dest_iata)
    if origin is None or dest is None:
        return None
    return haversine_km(
        origin.latitude, origin.longitude, dest.latitude, dest.longitude
    )


def search_airports(query: str, limit: int = 10) -> list[AirportEntry]:
    """Search commercial airports by IATA code, city, or airport name."""
    needle = query.strip().lower()
    if not needle:
        return list(_load_airports().values())[:limit]

    matches: list[tuple[int, AirportEntry]] = []
    for airport in _load_airports().values():
        if airport.iata.lower() == needle:
            matches.append((0, airport))
        elif airport.iata.lower().startswith(needle):
            matches.append((1, airport))
        elif needle in airport.city.lower() or needle in airport.name.lower():
            matches.append((2, airport))

    matches.sort(key=lambda pair: (pair[0], pair[1].iata))
    return [entry for _, entry in matches[:limit]]
