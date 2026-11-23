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
from app.schemas.stats import TravelStatsResponse

router = APIRouter(tags=["stats"])

ReadStatsAuth = Annotated[AuthContext, Depends(require_scope("stats:read"))]
DbSession = Annotated[AsyncSession, Depends(get_db)]


@router.get("/stats", response_model=TravelStatsResponse)
async def get_travel_stats(
    auth_ctx: ReadStatsAuth,
    db: DbSession,
    year: Annotated[int | None, Query(ge=1990, le=2100)] = None,
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
    trips = list((await db.scalars(stmt)).all())
    if year is not None:
        trips = [t for t in trips if t.start_date.year == year]

    home_country = auth_ctx.user.home_country_code.upper()
    countries: set[str] = set()
    international_trips = 0
    total_days = 0
    total_flight_km = 0.0
    total_ground_km = 0.0
    total_spend = Decimal("0.00")
    spend_by_category: dict[str, Decimal] = defaultdict(lambda: Decimal("0.00"))

    for trip in trips:
        total_days += (trip.end_date - trip.start_date).days + 1
        trip_countries = {c.upper() for c in (trip.country_codes or [])}
        countries.update(trip_countries)
        if any(code != home_country for code in trip_countries):
            international_trips += 1

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
                    dist = item.details.get("distance_km")
                    if isinstance(dist, (int, float)):
                        total_flight_km += float(dist)

        for exp in trip.expenses:
            total_spend += exp.amount_home
            spend_by_category[exp.category] += exp.amount_home

    return TravelStatsResponse(
        year=year,
        home_country_code=home_country,
        home_currency=auth_ctx.user.home_currency,
        total_trips=len(trips),
        international_trips=international_trips,
        countries_visited=sorted(countries),
        total_travel_days=total_days,
        total_flight_distance_km=round(total_flight_km, 2),
        total_ground_distance_km=round(total_ground_km, 2),
        total_spend_home=total_spend.quantize(Decimal("0.01")),
        spend_by_category={
            cat: amt.quantize(Decimal("0.01"))
            for cat, amt in spend_by_category.items()
        },
    )
