"""Trip, DayOption variants, ItineraryItem, RouteSegment, Share, and Expense models."""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base, utcnow
from app.models.enums import ExpenseCategory, ItemType, RouteProfile, TripStatus

if TYPE_CHECKING:
    from app.models.user import User


class Trip(Base):
    """Top-level travel itinerary spanning one or more days."""

    __tablename__ = "trips"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    destination_summary: Mapped[str | None] = mapped_column(String(200), nullable=True)
    country_codes: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    default_currency: Mapped[str] = mapped_column(
        String(3), nullable=False, default="JPY"
    )
    cover_image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=TripStatus.PLANNING.value
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow
    )

    user: Mapped["User"] = relationship(back_populates="trips")
    days: Mapped[list["TripDay"]] = relationship(
        back_populates="trip",
        cascade="all, delete-orphan",
        order_by="TripDay.day_index",
    )
    shares: Mapped[list["TripShare"]] = relationship(
        back_populates="trip", cascade="all, delete-orphan"
    )
    expenses: Mapped[list["Expense"]] = relationship(
        back_populates="trip", cascade="all, delete-orphan"
    )


class TripShare(Base):
    """Read-only share link with explicit backend-enforced visibility policy."""

    __tablename__ = "trip_shares"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    trip_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("trips.id", ondelete="CASCADE"), index=True
    )
    token: Mapped[str] = mapped_column(
        String(64), unique=True, index=True, nullable=False
    )
    label: Mapped[str | None] = mapped_column(String(80), nullable=True)
    # Explicit policy avoids hardcoding single privacy booleans on Trip.
    visibility_policy: Mapped[dict[str, bool]] = mapped_column(
        JSON,
        nullable=False,
        default=lambda: {
            "include_booking_refs": False,
            "include_notes": False,
            "include_expenses": False,
            "include_backup_options": False,
        },
    )
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )

    trip: Mapped[Trip] = relationship(back_populates="shares")


class TripDay(Base):
    """A single calendar day within a trip that can hold multiple Plan A/B options."""

    __tablename__ = "trip_days"
    __table_args__ = (
        UniqueConstraint("trip_id", "day_index", name="uq_trip_days_trip_day_index"),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    trip_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("trips.id", ondelete="CASCADE"), index=True
    )
    day_index: Mapped[int] = mapped_column(Integer, nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    title: Mapped[str | None] = mapped_column(String(160), nullable=True)
    # Nullable during initial insert before the default Plan A option is created.
    active_option_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("day_options.id", ondelete="SET NULL", use_alter=True),
        nullable=True,
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    trip: Mapped[Trip] = relationship(back_populates="days")
    options: Mapped[list["DayOption"]] = relationship(
        back_populates="trip_day",
        foreign_keys="DayOption.trip_day_id",
        cascade="all, delete-orphan",
        order_by="DayOption.sort_order",
    )


class DayOption(Base):
    """An itinerary variant (e.g., Plan A vs. Plan B Rainy) for a single TripDay."""

    __tablename__ = "day_options"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    trip_day_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("trip_days.id", ondelete="CASCADE"), index=True
    )
    label: Mapped[str] = mapped_column(String(80), nullable=False, default="Plan A")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    summary_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    cached_ground_distance_km: Mapped[float] = mapped_column(
        Float, nullable=False, default=0.0
    )
    cached_distance_is_approx: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow
    )

    trip_day: Mapped[TripDay] = relationship(
        back_populates="options", foreign_keys=[trip_day_id]
    )
    items: Mapped[list["ItineraryItem"]] = relationship(
        back_populates="day_option",
        cascade="all, delete-orphan",
        order_by="ItineraryItem.sort_order",
    )
    route_segments: Mapped[list["RouteSegment"]] = relationship(
        back_populates="day_option", cascade="all, delete-orphan"
    )


class ItineraryItem(Base):
    """An ordered entry within a DayOption (flight, transit, stay, spot, or food)."""

    __tablename__ = "itinerary_items"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    day_option_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("day_options.id", ondelete="CASCADE"), index=True
    )
    type: Mapped[str] = mapped_column(
        String(24), nullable=False, default=ItemType.SPOT.value
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    start_time: Mapped[str | None] = mapped_column(String(16), nullable=True)
    end_time: Mapped[str | None] = mapped_column(String(16), nullable=True)
    timezone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    address: Mapped[str | None] = mapped_column(String(300), nullable=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    google_maps_url: Mapped[str | None] = mapped_column(String(600), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Typed per-item payload validated by Pydantic discriminated schemas.
    details: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    # Optional slot-level choice group (e.g., 3 lunch candidates sharing one slot).
    choice_group_id: Mapped[str | None] = mapped_column(
        String(36), index=True, nullable=True
    )
    is_selected: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow
    )

    day_option: Mapped[DayOption] = relationship(back_populates="items")


class RouteSegment(Base):
    """Cached ground routing leg between two consecutive geolocated items."""

    __tablename__ = "route_segments"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    day_option_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("day_options.id", ondelete="CASCADE"), index=True
    )
    from_item_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("itinerary_items.id", ondelete="CASCADE"), index=True
    )
    to_item_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("itinerary_items.id", ondelete="CASCADE"), index=True
    )
    profile: Mapped[str] = mapped_column(
        String(24), nullable=False, default=RouteProfile.DRIVING.value
    )
    distance_km: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    duration_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    geometry_polyline: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_approx: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )

    day_option: Mapped[DayOption] = relationship(back_populates="route_segments")


class Expense(Base):
    """Actual trip spending record separate from daily itinerary headers."""

    __tablename__ = "expenses"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    trip_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("trips.id", ondelete="CASCADE"), index=True
    )
    trip_day_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("trip_days.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    itinerary_item_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("itinerary_items.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[str] = mapped_column(
        String(24), nullable=False, default=ExpenseCategory.OTHER.value
    )
    amount_original: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency_original: Mapped[str] = mapped_column(String(3), nullable=False)
    exchange_rate: Mapped[Decimal] = mapped_column(
        Numeric(12, 6), nullable=False, default=Decimal("1.000000")
    )
    amount_home: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency_home: Mapped[str] = mapped_column(String(3), nullable=False)
    paid_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
    payment_method: Mapped[str | None] = mapped_column(String(60), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )

    trip: Mapped[Trip] = relationship(back_populates="expenses")
