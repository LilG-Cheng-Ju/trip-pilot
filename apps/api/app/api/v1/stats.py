"""Annual and lifetime travel statistics aggregation endpoint."""

from collections import defaultdict
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import AuthContext, require_scope
from app.core.database import get_db
from app.models import DayOption, ItemType, Trip, TripDay, TripStatus
from app.schemas.stats import StatsScope, TravelStatsResponse, TripStatSummary

router = APIRouter(tags=["stats"])

ReadStatsAuth = Annotated[AuthContext, Depends(require_scope("stats:read"))]
DbSession = Annotated[AsyncSession, Depends(get_db)]


def _is_international_trip(trip: Trip, home_country: str) -> bool:
    trip_countries = {c.upper() for c in (trip.country_codes or [])}
    return any(code != home_country for code in trip_countries)


@router.get("/stats", response_model=TravelStatsResponse)
async def get_travel_stats(
    auth_ctx: ReadStatsAuth,
    db: DbSession,
    year: Annotated[int | None, Query(ge=1990, le=2100)] = None,
    scope: Annotated[StatsScope, Query()] = "all",
) -> TravelStatsResponse:
    """Aggregate travel metrics across non-archived trips using active day options."""
    stmt = (
        select(Trip)
        .where(
            Trip.user_id == auth_ctx.user.id,
            Trip.status != TripStatus.ARCHIVED.value,
        )
        .options(
            selectinload(Trip.days)
            .selectinload(TripDay.options)
            .selectinload(DayOption.items),
            selectinload(Trip.expenses),
        )
    )
    all_trips = list((await db.scalars(stmt)).all())
    available_years = sorted(
        {t.start_date.year for t in all_trips},
        reverse=True,
    )

    home_country = auth_ctx.user.home_country_code.upper()
    trips = all_trips
    if year is not None:
        trips = [t for t in trips if t.start_date.year == year]
    if scope == "domestic":
        trips = [t for t in trips if not _is_international_trip(t, home_country)]
    elif scope == "international":
        trips = [t for t in trips if _is_international_trip(t, home_country)]

    trips.sort(key=lambda t: t.start_date, reverse=True)

    countries: set[str] = set()
    country_visit_counts: dict[str, int] = defaultdict(int)
    domestic_trips = 0
    international_trips = 0
    total_days = 0
    flight_count = 0
    total_flight_km = 0.0
    total_ground_km = 0.0
    total_spend = Decimal("0.00")
    spend_by_category: dict[str, Decimal] = defaultdict(lambda: Decimal("0.00"))
    trip_summaries: list[TripStatSummary] = []

    for trip in trips:
        days_count = (trip.end_date - trip.start_date).days + 1
        total_days += days_count
        trip_countries = {c.upper() for c in (trip.country_codes or [])}
        countries.update(trip_countries)
        for code in trip_countries:
            country_visit_counts[code] += 1

        is_intl = _is_international_trip(trip, home_country)
        if is_intl:
            international_trips += 1
        else:
            domestic_trips += 1

        # Count only each day's active_option_id so Plan B backups are never doubled.
        for day in trip.days:
            active_opt = next(
                (opt for opt in day.options if opt.id == day.active_option_id),
                None,
            )
            if active_opt is None:
                continue
            total_ground_km += active_opt.cached_ground_distance_km
            for item in active_opt.items:
                if not item.is_selected:
                    continue
                if item.type == ItemType.FLIGHT.value:
                    flight_count += 1
                    dist = item.details.get("distance_km")
                    if isinstance(dist, (int, float)):
                        total_flight_km += float(dist)

        trip_spend = Decimal("0.00")
        for exp in trip.expenses:
            trip_spend += exp.amount_home
            total_spend += exp.amount_home
            spend_by_category[exp.category] += exp.amount_home

        trip_summaries.append(
            TripStatSummary(
                id=trip.id,
                title=trip.title,
                start_date=trip.start_date,
                end_date=trip.end_date,
                days=days_count,
                country_codes=sorted(trip_countries),
                is_international=is_intl,
                spend_home=trip_spend.quantize(Decimal("0.01")),
            )
        )

    avg_per_day = (
        (total_spend / Decimal(total_days)).quantize(Decimal("0.01"))
        if total_days > 0
        else Decimal("0.00")
    )

    return TravelStatsResponse(
        year=year,
        scope=scope,
        home_country_code=home_country,
        home_currency=auth_ctx.user.home_currency,
        available_years=available_years,
        total_trips=len(trips),
        domestic_trips=domestic_trips,
        international_trips=international_trips,
        countries_visited=sorted(countries),
        country_visit_counts=dict(
            sorted(country_visit_counts.items(), key=lambda kv: (-kv[1], kv[0]))
        ),
        total_travel_days=total_days,
        flight_count=flight_count,
        total_flight_distance_km=round(total_flight_km, 2),
        total_ground_distance_km=round(total_ground_km, 2),
        total_spend_home=total_spend.quantize(Decimal("0.01")),
        avg_spend_per_day=avg_per_day,
        spend_by_category={
            cat: amt.quantize(Decimal("0.01"))
            for cat, amt in spend_by_category.items()
        },
        trips=trip_summaries,
    )
