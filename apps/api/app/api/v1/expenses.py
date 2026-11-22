"""Trip expense tracking endpoints (separate from daily itinerary headers)."""

from collections import defaultdict
from datetime import UTC, datetime
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import AuthContext, require_scope
from app.core.database import get_db
from app.models import Expense, Trip
from app.schemas.expense import (
    ExpenseCreate,
    ExpenseResponse,
    ExpenseUpdate,
    TripExpensesSummaryResponse,
)

router = APIRouter(tags=["expenses"])

ReadExpensesAuth = Annotated[AuthContext, Depends(require_scope("expenses:read"))]
WriteExpensesAuth = Annotated[AuthContext, Depends(require_scope("expenses:write"))]
DbSession = Annotated[AsyncSession, Depends(get_db)]


async def _ensure_trip_owned(db: AsyncSession, trip_id: str, user_id: str) -> Trip:
    trip = await db.scalar(
        select(Trip).where(Trip.id == trip_id, Trip.user_id == user_id)
    )
    if trip is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found"
        )
    return trip


@router.get(
    "/trips/{trip_id}/expenses", response_model=TripExpensesSummaryResponse
)
async def list_trip_expenses(
    trip_id: str,
    auth_ctx: ReadExpensesAuth,
    db: DbSession,
) -> TripExpensesSummaryResponse:
    await _ensure_trip_owned(db, trip_id, auth_ctx.user.id)
    expenses = list(
        (
            await db.scalars(
                select(Expense)
                .where(Expense.trip_id == trip_id)
                .order_by(Expense.paid_at.desc())
            )
        ).all()
    )
    total_home = Decimal("0.00")
    by_category: dict[str, Decimal] = defaultdict(lambda: Decimal("0.00"))
    for exp in expenses:
        total_home += exp.amount_home
        by_category[exp.category] += exp.amount_home

    return TripExpensesSummaryResponse(
        trip_id=trip_id,
        home_currency=auth_ctx.user.home_currency,
        total_home_amount=total_home.quantize(Decimal("0.01")),
        by_category={
            cat: amt.quantize(Decimal("0.01")) for cat, amt in by_category.items()
        },
        items=[ExpenseResponse.model_validate(exp) for exp in expenses],
    )


@router.post(
    "/trips/{trip_id}/expenses",
    response_model=ExpenseResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_expense(
    trip_id: str,
    payload: ExpenseCreate,
    auth_ctx: WriteExpensesAuth,
    db: DbSession,
) -> ExpenseResponse:
    await _ensure_trip_owned(db, trip_id, auth_ctx.user.id)
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
        currency_home=auth_ctx.user.home_currency,
        paid_at=payload.paid_at or datetime.now(UTC),
        payment_method=payload.payment_method,
        notes=payload.notes,
    )
    db.add(expense)
    await db.commit()
    await db.refresh(expense)
    return ExpenseResponse.model_validate(expense)


@router.patch("/expenses/{expense_id}", response_model=ExpenseResponse)
async def update_expense(
    expense_id: str,
    payload: ExpenseUpdate,
    auth_ctx: WriteExpensesAuth,
    db: DbSession,
) -> ExpenseResponse:
    expense = await db.scalar(
        select(Expense)
        .join(Trip, Trip.id == Expense.trip_id)
        .where(Expense.id == expense_id, Trip.user_id == auth_ctx.user.id)
    )
    if expense is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found"
        )

    updates = payload.model_dump(exclude_unset=True)
    if "category" in updates and updates["category"] is not None:
        updates["category"] = updates["category"].value
    for field, value in updates.items():
        setattr(expense, field, value)

    if (
        "amount_home" not in updates
        and ("amount_original" in updates or "exchange_rate" in updates)
    ):
        expense.amount_home = (
            expense.amount_original * expense.exchange_rate
        ).quantize(Decimal("0.01"))

    await db.commit()
    await db.refresh(expense)
    return ExpenseResponse.model_validate(expense)


@router.delete("/expenses/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_expense(
    expense_id: str,
    auth_ctx: WriteExpensesAuth,
    db: DbSession,
) -> None:
    expense = await db.scalar(
        select(Expense)
        .join(Trip, Trip.id == Expense.trip_id)
        .where(Expense.id == expense_id, Trip.user_id == auth_ctx.user.id)
    )
    if expense is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found"
        )
    await db.delete(expense)
    await db.commit()
