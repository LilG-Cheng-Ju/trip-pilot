"""Pydantic v2 schemas for trips, day options, itinerary items, and sharing."""

from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.enums import ItemType, RouteProfile, TripStatus

SENSITIVE_DETAIL_KEYS: frozenset[str] = frozenset(
    {"booking_ref", "confirmation_code", "reservation_code", "attachments"}
)


class ShareVisibilityPolicy(BaseModel):
    """Explicit backend-enforced privacy policy for read-only share links."""

    include_booking_refs: bool = False
    include_notes: bool = False
    include_expenses: bool = False
    include_backup_options: bool = False


class RouteSegmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    from_item_id: str
    to_item_id: str
    profile: RouteProfile
    distance_km: float
    duration_min: int | None
    geometry_polyline: str | None
    is_approx: bool


class ItineraryItemCreate(BaseModel):
    type: ItemType = ItemType.SPOT
    title: str = Field(min_length=1, max_length=200)
    sort_order: int | None = None
    start_time: str | None = Field(default=None, max_length=16)
    end_time: str | None = Field(default=None, max_length=16)
    timezone: str | None = Field(default=None, max_length=64)
    address: str | None = Field(default=None, max_length=300)
    latitude: float | None = Field(default=None, ge=-90.0, le=90.0)
    longitude: float | None = Field(default=None, ge=-180.0, le=180.0)
    google_maps_url: str | None = Field(default=None, max_length=600)
    notes: str | None = None
    details: dict[str, Any] = Field(default_factory=dict)
    choice_group_id: str | None = Field(default=None, max_length=36)
    # Optional ID of an existing item to group with as a slot-level alternative.
    alternative_for_item_id: str | None = None
    is_selected: bool = True


class ItineraryItemUpdate(BaseModel):
    type: ItemType | None = None
    title: str | None = Field(default=None, min_length=1, max_length=200)
    sort_order: int | None = None
    start_time: str | None = Field(default=None, max_length=16)
    end_time: str | None = Field(default=None, max_length=16)
    timezone: str | None = Field(default=None, max_length=64)
    address: str | None = Field(default=None, max_length=300)
    latitude: float | None = Field(default=None, ge=-90.0, le=90.0)
    longitude: float | None = Field(default=None, ge=-180.0, le=180.0)
    google_maps_url: str | None = Field(default=None, max_length=600)
    notes: str | None = None
    details: dict[str, Any] | None = None
    choice_group_id: str | None = None
    is_selected: bool | None = None


class ItineraryItemReorderRequest(BaseModel):
    item_ids: list[str] = Field(min_length=1)


class ItineraryItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    day_option_id: str
    type: ItemType
    sort_order: int
    title: str
    start_time: str | None
    end_time: str | None
    timezone: str | None
    address: str | None
    latitude: float | None
    longitude: float | None
    google_maps_url: str | None
    notes: str | None
    details: dict[str, Any]
    choice_group_id: str | None = None
    is_selected: bool = True


class DayOptionCreate(BaseModel):
    label: str = Field(min_length=1, max_length=80)
    summary_notes: str | None = None


class DayOptionCloneRequest(BaseModel):
    label: str = Field(min_length=1, max_length=80)


class ActiveOptionUpdate(BaseModel):
    day_option_id: str


class TripDayUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=160)
    notes: str | None = None


class DayOptionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    trip_day_id: str
    label: str
    sort_order: int
    summary_notes: str | None
    cached_ground_distance_km: float
    cached_distance_is_approx: bool
    items: list[ItineraryItemResponse] = Field(default_factory=list)
    route_segments: list[RouteSegmentResponse] = Field(default_factory=list)


class TripDayResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    trip_id: str
    day_index: int
    date: date
    title: str | None
    active_option_id: str | None
    notes: str | None
    options: list[DayOptionResponse] = Field(default_factory=list)


class TripCreate(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    destination_summary: str | None = Field(default=None, max_length=200)
    country_codes: list[str] = Field(default_factory=list)
    start_date: date
    end_date: date
    default_currency: str = Field(default="JPY", min_length=3, max_length=3)
    cover_image_url: str | None = Field(default=None, max_length=500)
    status: TripStatus = TripStatus.PLANNING
    notes: str | None = None

    @field_validator("default_currency")
    @classmethod
    def _upper_currency(cls, value: str) -> str:
        return value.upper()

    @field_validator("country_codes")
    @classmethod
    def _upper_countries(cls, values: list[str]) -> list[str]:
        normalized: list[str] = []
        for code in values:
            clean = code.strip().upper()
            if len(clean) != 2:
                raise ValueError(f"Invalid ISO-2 country code: {code}")
            if clean not in normalized:
                normalized.append(clean)
        return normalized

    @model_validator(mode="after")
    def _validate_date_range(self) -> "TripCreate":
        if self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        if (self.end_date - self.start_date).days > 60:
            raise ValueError("Trip duration cannot exceed 61 days")
        return self


class TripUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    destination_summary: str | None = Field(default=None, max_length=200)
    country_codes: list[str] | None = None
    default_currency: str | None = Field(default=None, min_length=3, max_length=3)
    cover_image_url: str | None = Field(default=None, max_length=500)
    status: TripStatus | None = None
    notes: str | None = None

    @field_validator("default_currency")
    @classmethod
    def _upper_currency(cls, value: str | None) -> str | None:
        return value.upper() if value is not None else None


class TripSummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    destination_summary: str | None
    country_codes: list[str]
    start_date: date
    end_date: date
    default_currency: str
    cover_image_url: str | None
    status: TripStatus
    created_at: datetime
    updated_at: datetime


class TripDetailResponse(TripSummaryResponse):
    notes: str | None
    days: list[TripDayResponse] = Field(default_factory=list)


class TripShareCreate(BaseModel):
    label: str | None = Field(default=None, max_length=80)
    visibility_policy: ShareVisibilityPolicy = Field(
        default_factory=ShareVisibilityPolicy
    )
    expires_at: datetime | None = None


class TripShareResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    trip_id: str
    token: str
    label: str | None
    visibility_policy: ShareVisibilityPolicy
    expires_at: datetime | None
    revoked_at: datetime | None
    created_at: datetime


class PublicTripResponse(BaseModel):
    """Sanitized read-only trip payload returned for /api/v1/public/trips/{token}."""

    title: str
    destination_summary: str | None
    country_codes: list[str]
    start_date: date
    end_date: date
    default_currency: str
    cover_image_url: str | None
    notes: str | None
    visibility_policy: ShareVisibilityPolicy
    days: list[TripDayResponse]


def sanitize_item_for_share(
    item: ItineraryItemResponse, policy: ShareVisibilityPolicy
) -> ItineraryItemResponse:
    """Strip sensitive fields from an itinerary item according to share policy."""
    sanitized_details = dict(item.details)
    if not policy.include_booking_refs:
        for key in SENSITIVE_DETAIL_KEYS:
            sanitized_details.pop(key, None)

    return item.model_copy(
        update={
            "notes": item.notes if policy.include_notes else None,
            "details": sanitized_details,
        }
    )
