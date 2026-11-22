"""Pydantic schemas for annual and lifetime travel statistics."""

from decimal import Decimal

from pydantic import BaseModel


class TravelStatsResponse(BaseModel):
    year: int | None
    home_country_code: str
    home_currency: str
    total_trips: int
    international_trips: int
    countries_visited: list[str]
    total_travel_days: int
    total_flight_distance_km: float
    total_ground_distance_km: float
    total_spend_home: Decimal
    spend_by_category: dict[str, Decimal]
