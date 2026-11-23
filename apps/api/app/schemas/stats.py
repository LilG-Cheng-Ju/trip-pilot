"""Pydantic schemas for annual and lifetime travel statistics."""

from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel

StatsScope = Literal["all", "domestic", "international"]


class TripStatSummary(BaseModel):
    """Lightweight trip entry displayed inside the Dashboard trip list."""

    id: str
    title: str
    start_date: date
    end_date: date
    days: int
    country_codes: list[str]
    is_international: bool
    spend_home: Decimal


class TravelStatsResponse(BaseModel):
    year: int | None
    scope: StatsScope = "all"
    home_country_code: str
    home_currency: str
    available_years: list[int]
    total_trips: int
    domestic_trips: int
    international_trips: int
    countries_visited: list[str]
    country_visit_counts: dict[str, int]
    total_travel_days: int
    flight_count: int
    total_flight_distance_km: float
    total_ground_distance_km: float
    total_spend_home: Decimal
    avg_spend_per_day: Decimal
    spend_by_category: dict[str, Decimal]
    trips: list[TripStatSummary]
