"""Repository for Trip, TripDay, DayOption, ItineraryItem, and TripShare queries."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import DayOption, ItineraryItem, Trip, TripDay, TripShare


def _trip_detail_options():
    return selectinload(Trip.days).selectinload(TripDay.options).options(
        selectinload(DayOption.items),
        selectinload(DayOption.route_segments),
    )


class TripRepository:
    """Encapsulates all SQLAlchemy queries for trip aggregates."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def list_by_user(
        self, user_id: str, status_filter: str | None = None
    ) -> list[Trip]:
        stmt = (
            select(Trip)
            .where(Trip.user_id == user_id)
            .order_by(Trip.start_date.desc())
        )
        if status_filter:
            stmt = stmt.where(Trip.status == status_filter)
        return list((await self.db.scalars(stmt)).all())

    async def get_detail(self, trip_id: str, user_id: str) -> Trip | None:
        stmt = (
            select(Trip)
            .where(Trip.id == trip_id, Trip.user_id == user_id)
            .options(_trip_detail_options())
        )
        return await self.db.scalar(stmt)

    async def get_day_for_user(self, day_id: str, user_id: str) -> TripDay | None:
        stmt = (
            select(TripDay)
            .join(Trip, Trip.id == TripDay.trip_id)
            .where(TripDay.id == day_id, Trip.user_id == user_id)
            .options(
                selectinload(TripDay.options).options(
                    selectinload(DayOption.items),
                    selectinload(DayOption.route_segments),
                )
            )
        )
        return await self.db.scalar(stmt)

    async def get_trip_for_day(self, day_id: str, user_id: str) -> Trip | None:
        stmt = (
            select(Trip)
            .join(TripDay, TripDay.trip_id == Trip.id)
            .where(TripDay.id == day_id, Trip.user_id == user_id)
            .options(_trip_detail_options())
        )
        return await self.db.scalar(stmt)

    async def get_option_for_user(
        self, option_id: str, user_id: str
    ) -> DayOption | None:
        stmt = (
            select(DayOption)
            .join(TripDay, TripDay.id == DayOption.trip_day_id)
            .join(Trip, Trip.id == TripDay.trip_id)
            .where(DayOption.id == option_id, Trip.user_id == user_id)
            .options(
                selectinload(DayOption.items),
                selectinload(DayOption.route_segments),
            )
        )
        return await self.db.scalar(stmt)

    async def get_item_for_user(
        self, item_id: str, user_id: str
    ) -> ItineraryItem | None:
        stmt = (
            select(ItineraryItem)
            .join(DayOption, DayOption.id == ItineraryItem.day_option_id)
            .join(TripDay, TripDay.id == DayOption.trip_day_id)
            .join(Trip, Trip.id == TripDay.trip_id)
            .where(ItineraryItem.id == item_id, Trip.user_id == user_id)
        )
        return await self.db.scalar(stmt)

    async def get_share_by_token(self, token: str) -> TripShare | None:
        stmt = (
            select(TripShare)
            .where(TripShare.token == token)
            .options(selectinload(TripShare.trip).options(_trip_detail_options()))
        )
        return await self.db.scalar(stmt)

    async def list_shares(self, trip_id: str, user_id: str) -> list[TripShare]:
        stmt = (
            select(TripShare)
            .join(Trip, Trip.id == TripShare.trip_id)
            .where(TripShare.trip_id == trip_id, Trip.user_id == user_id)
            .order_by(TripShare.created_at.desc())
        )
        return list((await self.db.scalars(stmt)).all())
