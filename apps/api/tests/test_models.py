"""Tests verifying SQLAlchemy schema creation and core table relationships."""

from datetime import date

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.database import Base
from app.models import DayOption, ItemType, ItineraryItem, Trip, TripDay, User


@pytest.mark.asyncio
async def test_create_trip_with_day_option_variants() -> None:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        user = User(firebase_uid="dev-test", email="dev@local.host")
        session.add(user)
        await session.flush()

        trip = Trip(
            user_id=user.id,
            title="Tokyo & Izu",
            country_codes=["JP"],
            start_date=date(2026, 11, 24),
            end_date=date(2026, 11, 25),
        )
        session.add(trip)
        await session.flush()

        day = TripDay(trip_id=trip.id, day_index=1, date=date(2026, 11, 24))
        session.add(day)
        await session.flush()

        plan_a = DayOption(trip_day_id=day.id, label="Plan A", sort_order=0)
        plan_b = DayOption(trip_day_id=day.id, label="Plan B · Rainy", sort_order=1)
        session.add_all([plan_a, plan_b])
        await session.flush()

        day.active_option_id = plan_a.id
        item = ItineraryItem(
            day_option_id=plan_a.id,
            type=ItemType.FLIGHT.value,
            sort_order=0,
            title="NH852 TSA -> HND",
            details={"origin_iata": "TSA", "dest_iata": "HND", "distance_km": 2095.0},
        )
        session.add(item)
        await session.commit()

        stored_options = (
            await session.scalars(
                select(DayOption).where(DayOption.trip_day_id == day.id)
            )
        ).all()
        assert len(stored_options) == 2
        assert day.active_option_id == plan_a.id

    await engine.dispose()
