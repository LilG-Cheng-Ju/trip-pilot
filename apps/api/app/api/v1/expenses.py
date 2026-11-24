"""Trip expense tracking endpoints (separate from daily itinerary headers)."""

from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import AuthContext, require_scope
from app.core.database import get_db
from app.schemas.expense import (
    ExpenseCreate,
    ExpenseResponse,
    ExpenseUpdate,
    TripExpensesSummaryResponse,
)
from app.services.expense_service import ExpenseService

router = APIRouter(tags=["expenses"])

ReadExpensesAuth = Annotated[AuthContext, Depends(require_scope("expenses:read"))]
WriteExpensesAuth = Annotated[AuthContext, Depends(require_scope("expenses:write"))]
DbSession = Annotated[AsyncSession, Depends(get_db)]


@router.get(
    "/trips/{trip_id}/expenses", response_model=TripExpensesSummaryResponse
)
async def list_trip_expenses(
    trip_id: str,
    auth_ctx: ReadExpensesAuth,
    db: DbSession,
) -> TripExpensesSummaryResponse:
    return await ExpenseService(db).list_trip_expenses(trip_id, auth_ctx.user)


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
    return await ExpenseService(db).create_expense(trip_id, auth_ctx.user, payload)


@router.patch("/expenses/{expense_id}", response_model=ExpenseResponse)
async def update_expense(
    expense_id: str,
    payload: ExpenseUpdate,
    auth_ctx: WriteExpensesAuth,
    db: DbSession,
) -> ExpenseResponse:
    return await ExpenseService(db).update_expense(
        expense_id, auth_ctx.user, payload
    )


@router.delete("/expenses/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_expense(
    expense_id: str,
    auth_ctx: WriteExpensesAuth,
    db: DbSession,
) -> None:
    await ExpenseService(db).delete_expense(expense_id, auth_ctx.user.id)
