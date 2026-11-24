"""Business logic for trip expenses, link checks, and currency conversion."""

from collections import defaultdict
from datetime import UTC, datetime
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import DayOption, Expense, ItineraryItem, Trip, TripDay, User
from app.schemas.expense import (
    ExpenseCreate,
    ExpenseResponse,
    ExpenseUpdate,
    TripExpensesSummaryResponse,
)
from app.services.fx_service import get_fx_provider


async def convert_expense_to_home(
    exp: Expense, target_home_currency: str
) -> Decimal:
    """Normalize an expense's home amount into the user's current home currency."""
    target = target_home_currency.upper()
    if exp.currency_home.upper() == target:
        return exp.amount_home
    if exp.currency_original.upper() == target:
        return exp.amount_original.quantize(Decimal("0.01"))
    rate, _, _ = await get_fx_provider().get_rate(
        exp.currency_home.upper(), target
    )
    return (exp.amount_home * Decimal(str(rate))).quantize(Decimal("0.01"))


class ExpenseService:
    """Orchestrates expense CRUD, ownership checks, and home-currency summaries."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def _ensure_trip_owned(self, trip_id: str, user_id: str) -> Trip:
        trip = await self.db.scalar(
            select(Trip).where(Trip.id == trip_id, Trip.user_id == user_id)
        )
        if trip is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found"
            )
        return trip

    async def _validate_expense_links(
        self,
        trip_id: str,
        trip_day_id: str | None,
        itinerary_item_id: str | None,
    ) -> None:
        """Prevent linking an expense across trips or to an item on a different day."""
        if trip_day_id is not None:
            day_exists = await self.db.scalar(
                select(TripDay.id).where(
                    TripDay.id == trip_day_id,
                    TripDay.trip_id == trip_id,
                )
            )
            if day_exists is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="trip_day_id does not belong to this trip",
                )
        if itinerary_item_id is not None:
            item_day_id = await self.db.scalar(
                select(DayOption.trip_day_id)
                .join(ItineraryItem, ItineraryItem.day_option_id == DayOption.id)
                .join(TripDay, TripDay.id == DayOption.trip_day_id)
                .where(
                    ItineraryItem.id == itinerary_item_id,
                    TripDay.trip_id == trip_id,
                )
            )
            if item_day_id is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="itinerary_item_id does not belong to this trip",
                )
            if trip_day_id is not None and item_day_id != trip_day_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="itinerary_item_id does not belong to trip_day_id",
                )

    async def list_trip_expenses(
        self, trip_id: str, user: User
    ) -> TripExpensesSummaryResponse:
        await self._ensure_trip_owned(trip_id, user.id)
        expenses = list(
            (
                await self.db.scalars(
                    select(Expense)
                    .where(Expense.trip_id == trip_id)
                    .order_by(Expense.paid_at.desc())
                )
            ).all()
        )
        total_home = Decimal("0.00")
        by_category: dict[str, Decimal] = defaultdict(lambda: Decimal("0.00"))
        for exp in expenses:
            normalized_amount = await convert_expense_to_home(
                exp, user.home_currency
            )
            total_home += normalized_amount
            by_category[exp.category] += normalized_amount

        return TripExpensesSummaryResponse(
            trip_id=trip_id,
            home_currency=user.home_currency,
            total_home_amount=total_home.quantize(Decimal("0.01")),
            by_category={
                cat: amt.quantize(Decimal("0.01"))
                for cat, amt in by_category.items()
            },
            items=[ExpenseResponse.model_validate(exp) for exp in expenses],
        )

    async def create_expense(
        self, trip_id: str, user: User, payload: ExpenseCreate
    ) -> ExpenseResponse:
        await self._ensure_trip_owned(trip_id, user.id)
        await self._validate_expense_links(
            trip_id, payload.trip_day_id, payload.itinerary_item_id
        )
        amount_home = (
            payload.amount_home
            if payload.amount_home is not None
            else (payload.amount_original * payload.exchange_rate).quantize(
                Decimal("0.01")
            )
        )
        expense = Expense(
            trip_id=trip_id,
            trip_day_id=payload.trip_day_id,
            itinerary_item_id=payload.itinerary_item_id,
            title=payload.title,
            category=payload.category.value,
            amount_original=payload.amount_original,
            currency_original=payload.currency_original,
            exchange_rate=payload.exchange_rate,
            amount_home=amount_home,
            currency_home=user.home_currency,
            paid_at=payload.paid_at or datetime.now(UTC),
            payment_method=payload.payment_method,
            notes=payload.notes,
        )
        self.db.add(expense)
        await self.db.commit()
        await self.db.refresh(expense)
        return ExpenseResponse.model_validate(expense)

    async def update_expense(
        self, expense_id: str, user: User, payload: ExpenseUpdate
    ) -> ExpenseResponse:
        expense = await self.db.scalar(
            select(Expense)
            .join(Trip, Trip.id == Expense.trip_id)
            .where(Expense.id == expense_id, Trip.user_id == user.id)
        )
        if expense is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found"
            )

        updates = payload.model_dump(exclude_unset=True)
        if "trip_day_id" in updates or "itinerary_item_id" in updates:
            effective_day_id = updates.get("trip_day_id", expense.trip_day_id)
            effective_item_id = updates.get(
                "itinerary_item_id", expense.itinerary_item_id
            )
            await self._validate_expense_links(
                expense.trip_id,
                effective_day_id,
                effective_item_id,
            )
        if "category" in updates and updates["category"] is not None:
            updates["category"] = updates["category"].value
        for field, value in updates.items():
            setattr(expense, field, value)

        if "amount_home" not in updates and (
            "amount_original" in updates or "exchange_rate" in updates
        ):
            expense.amount_home = (
                expense.amount_original * expense.exchange_rate
            ).quantize(Decimal("0.01"))

        await self.db.commit()
        await self.db.refresh(expense)
        return ExpenseResponse.model_validate(expense)

    async def delete_expense(self, expense_id: str, user_id: str) -> None:
        expense = await self.db.scalar(
            select(Expense)
            .join(Trip, Trip.id == Expense.trip_id)
            .where(Expense.id == expense_id, Trip.user_id == user_id)
        )
        if expense is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found"
            )
        await self.db.delete(expense)
        await self.db.commit()
