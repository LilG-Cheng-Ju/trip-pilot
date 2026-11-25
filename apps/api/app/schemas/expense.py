"""Pydantic schemas for actual trip expenses and category breakdowns."""

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.constants import ISO_CURRENCY_CODE_LENGTH, MAX_NOTES_LENGTH
from app.models.enums import ExpenseCategory


class ExpenseCreate(BaseModel):
    trip_day_id: str | None = None
    itinerary_item_id: str | None = None
    title: str = Field(min_length=1, max_length=200)
    category: ExpenseCategory = ExpenseCategory.OTHER
    amount_original: Decimal = Field(gt=Decimal("0"))
    currency_original: str = Field(
        min_length=ISO_CURRENCY_CODE_LENGTH, max_length=ISO_CURRENCY_CODE_LENGTH
    )
    exchange_rate: Decimal | None = Field(default=None, gt=Decimal("0"))
    amount_home: Decimal | None = Field(default=None, gt=Decimal("0"))
    paid_at: datetime | None = None
    payment_method: str | None = Field(default=None, max_length=60)
    notes: str | None = Field(default=None, max_length=MAX_NOTES_LENGTH)

    @field_validator("currency_original")
    @classmethod
    def _upper_currency(cls, value: str) -> str:
        return value.upper()


class ExpenseUpdate(BaseModel):
    trip_day_id: str | None = None
    itinerary_item_id: str | None = None
    title: str | None = Field(default=None, min_length=1, max_length=200)
    category: ExpenseCategory | None = None
    amount_original: Decimal | None = Field(default=None, gt=Decimal("0"))
    currency_original: str | None = Field(
        default=None,
        min_length=ISO_CURRENCY_CODE_LENGTH,
        max_length=ISO_CURRENCY_CODE_LENGTH,
    )
    exchange_rate: Decimal | None = Field(default=None, gt=Decimal("0"))
    amount_home: Decimal | None = Field(default=None, gt=Decimal("0"))
    paid_at: datetime | None = None
    payment_method: str | None = Field(default=None, max_length=60)
    notes: str | None = Field(default=None, max_length=MAX_NOTES_LENGTH)

    @field_validator("currency_original")
    @classmethod
    def _upper_currency(cls, value: str | None) -> str | None:
        return value.upper() if value is not None else None


class ExpenseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    trip_id: str
    trip_day_id: str | None
    itinerary_item_id: str | None
    title: str
    category: ExpenseCategory
    amount_original: Decimal
    currency_original: str
    exchange_rate: Decimal
    amount_home: Decimal
    currency_home: str
    paid_at: datetime
    payment_method: str | None
    notes: str | None


class TripExpensesSummaryResponse(BaseModel):
    trip_id: str
    home_currency: str
    total_home_amount: Decimal
    by_category: dict[str, Decimal]
    items: list[ExpenseResponse]
