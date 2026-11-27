"""Trip CRUD and trip day management operations."""

from datetime import timedelta

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from app.core.constants import MAX_TRIP_DATE_SPAN_DAYS
from app.models import DayOption, Expense, ItemType, Trip, TripDay
from app.schemas.trip import TripCreate, TripDayUpdate, TripUpdate
from app.services.trip_service.base import TripServiceBase
from app.services.trip_service.helpers import require_found


class TripDaysMixin(TripServiceBase):
    """Trip lifecycle and day scaffold/re-indexing mutations."""

    async def list_trips(
        self, user_id: str, status_filter: str | None = None
    ) -> list[Trip]:
        return await self.repo.list_by_user(user_id, status_filter)

    async def create_trip(self, user_id: str, payload: TripCreate) -> Trip:
        trip = Trip(
            user_id=user_id,
            title=payload.title,
            destination_summary=payload.destination_summary,
            country_codes=payload.country_codes,
            start_date=payload.start_date,
            end_date=payload.end_date,
            default_currency=payload.default_currency,
            cover_image_url=payload.cover_image_url,
            status=payload.status.value,
            notes=payload.notes,
        )
        self.db.add(trip)
        await self.db.flush()

        # Auto-scaffold TripDay + default "Plan A" DayOption for each calendar day.
        num_days = (payload.end_date - payload.start_date).days + 1
        for offset in range(num_days):
            trip_day = TripDay(
                trip_id=trip.id,
                day_index=offset + 1,
                date=payload.start_date + timedelta(days=offset),
            )
            self.db.add(trip_day)
            await self.db.flush()

            plan_a = DayOption(
                trip_day_id=trip_day.id,
                label="Plan A",
                sort_order=0,
            )
            self.db.add(plan_a)
            await self.db.flush()
            trip_day.active_option_id = plan_a.id

        await self.db.commit()
        return require_found(
            await self.repo.get_detail(trip.id, user_id), "Trip not found"
        )

    async def get_trip_detail(self, trip_id: str, user_id: str) -> Trip:
        trip = await self.repo.get_detail(trip_id, user_id)
        if trip is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found"
            )
        return trip

    async def update_trip(
        self, trip_id: str, user_id: str, payload: TripUpdate
    ) -> Trip:
        trip = await self.get_trip_detail(trip_id, user_id)
        updates = payload.model_dump(exclude_unset=True)
        new_start_date = updates.pop("start_date", None)
        if "status" in updates and updates["status"] is not None:
            updates["status"] = updates["status"].value
        for field, value in updates.items():
            setattr(trip, field, value)

        if new_start_date is not None and new_start_date != trip.start_date:
            delta = new_start_date - trip.start_date
            trip.start_date = new_start_date
            for day in trip.days:
                day.date = new_start_date + timedelta(days=day.day_index - 1)
            if trip.end_date is not None:
                if trip.days:
                    max_day_index = max(day.day_index for day in trip.days)
                    trip.end_date = new_start_date + timedelta(
                        days=max_day_index - 1
                    )
                else:
                    trip.end_date = trip.end_date + delta

        await self.db.commit()
        return await self.get_trip_detail(trip_id, user_id)

    async def delete_trip(self, trip_id: str, user_id: str) -> None:
        trip = await self.get_trip_detail(trip_id, user_id)
        # Break circular TripDay.active_option_id <-> DayOption.trip_day_id FKs first.
        for day in trip.days:
            day.active_option_id = None
        await self.db.flush()
        await self.db.delete(trip)
        await self.db.commit()

    async def append_day(self, trip_id: str, user_id: str) -> TripDay:
        trip = await self.get_trip_detail(trip_id, user_id)
        next_index = max((d.day_index for d in trip.days), default=0) + 1
        next_date = (
            trip.days[-1].date + timedelta(days=1) if trip.days else trip.start_date
        )
        if (
            len(trip.days) > MAX_TRIP_DATE_SPAN_DAYS
            or (next_date - trip.start_date).days > MAX_TRIP_DATE_SPAN_DAYS
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Trip duration cannot exceed {MAX_TRIP_DATE_SPAN_DAYS + 1} days"
                ),
            )
        new_day = TripDay(
            trip_id=trip.id,
            day_index=next_index,
            date=next_date,
        )
        self.db.add(new_day)
        try:
            await self.db.flush()

            plan_a = DayOption(trip_day_id=new_day.id, label="Plan A", sort_order=0)
            self.db.add(plan_a)
            await self.db.flush()
            new_day.active_option_id = plan_a.id

            if next_date > trip.end_date:
                trip.end_date = next_date

            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Concurrent day update detected, please retry",
            ) from exc
        return require_found(
            await self.repo.get_day_for_user(new_day.id, user_id),
            "Trip day not found",
        )

    async def delete_day(self, day_id: str, user_id: str) -> None:
        day = await self.repo.get_day_for_user(day_id, user_id)
        if day is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Trip day not found"
            )
        trip = require_found(
            await self.db.scalar(
                select(Trip).where(Trip.id == day.trip_id, Trip.user_id == user_id)
            ),
            "Trip not found",
        )
        days = list(
            (
                await self.db.scalars(
                    select(TripDay)
                    .where(TripDay.trip_id == trip.id)
                    .order_by(TripDay.day_index)
                )
            ).all()
        )
        if len(days) <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete the last remaining day",
            )

        deleted_day_index = day.day_index
        had_stay = any(
            item.type == ItemType.STAY.value
            for opt in day.options
            for item in opt.items
        )

        # Unlink expenses explicitly before deleting so SQLite and Postgres
        # preserve spending records without FK errors.
        await self.db.execute(
            update(Expense)
            .where(Expense.trip_day_id == day.id)
            .values(trip_day_id=None)
        )
        day_item_ids = [item.id for opt in day.options for item in opt.items]
        await self._unlink_item_expenses(day_item_ids)

        # Clear active_option_id first to break the circular TripDay <-> DayOption FK.
        day.active_option_id = None
        await self.db.flush()
        await self.db.delete(day)
        await self.db.flush()
        await self._delete_item_route_segments(day_item_ids)

        remaining = [d for d in days if d.id != day.id]
        # Shift into a disjoint temporary range so sequential re-indexing never
        # trips the unique (trip_id, day_index) constraint mid-update.
        for rem_day in remaining:
            rem_day.day_index += 1000
        await self.db.flush()

        for idx, rem_day in enumerate(remaining, start=1):
            rem_day.day_index = idx
            if trip.start_date is not None:
                rem_day.date = trip.start_date + timedelta(days=idx - 1)

        if trip.end_date is not None and trip.start_date is not None:
            trip.end_date = trip.start_date + timedelta(days=len(remaining) - 1)

        self.db.expire(trip, ["days"])
        await self.db.commit()

        if had_stay:
            await self._sync_routes_after_commit(
                trip.id,
                user_id,
                [],
                cascade_after_day_index=deleted_day_index - 1,
                invalidate_item_ids=set(day_item_ids),
            )

    async def update_day(
        self, day_id: str, user_id: str, payload: TripDayUpdate
    ) -> TripDay:
        day = await self.repo.get_day_for_user(day_id, user_id)
        if day is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Trip day not found"
            )
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(day, field, value)
        await self.db.commit()
        return require_found(
            await self.repo.get_day_for_user(
                day_id, user_id, populate_existing=True
            ),
            "Trip day not found",
        )
