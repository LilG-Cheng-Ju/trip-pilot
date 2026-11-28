"""Pydantic v2 schemas for trips, day options, itinerary items, and sharing."""

import json
import re
from datetime import date, datetime
from typing import Any, Literal
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.constants import (
    ISO_COUNTRY_CODE_LENGTH,
    ISO_CURRENCY_CODE_LENGTH,
    MAX_NOTES_LENGTH,
    MAX_TRIP_DATE_SPAN_DAYS,
)
from app.models.enums import ItemType, RouteProfile, TripStatus
from app.services.airport_service import infer_flight_airport_role

SENSITIVE_DETAIL_KEYS: frozenset[str] = frozenset(
    {"booking_ref", "confirmation_code", "reservation_code", "attachments"}
)
_HH_MM_RE = re.compile(r"^(\d{1,2}):(\d{2})$")
_IATA_RE = re.compile(r"^[A-Z0-9]{3}$")
_MAX_DETAILS_JSON_BYTES = 16_384
_MAX_ATTACHMENTS = 20


def _normalize_time_str(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    match = _HH_MM_RE.fullmatch(cleaned)
    if match is None:
        raise ValueError("Time must be in HH:MM format")
    hour, minute = int(match.group(1)), int(match.group(2))
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        raise ValueError("Time must be a valid 24-hour clock value (00:00–23:59)")
    return f"{hour:02d}:{minute:02d}"


def _validate_http_url(url: str | None) -> str | None:
    if url is None:
        return None
    cleaned = url.strip()
    if not cleaned:
        return None
    parsed = urlparse(cleaned)
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.netloc:
        raise ValueError("URL must use http:// or https://")
    return cleaned


def _validate_details_size(details: dict[str, Any]) -> dict[str, Any]:
    encoded_details = json.dumps(details, ensure_ascii=False, default=str)
    if len(encoded_details) > _MAX_DETAILS_JSON_BYTES:
        raise ValueError(f"details payload exceeds {_MAX_DETAILS_JSON_BYTES} bytes")
    return details


def _validate_details_attachments(details: dict[str, Any]) -> dict[str, Any]:
    _validate_details_size(details)
    if "attachments" in details and details["attachments"] is not None:
        attachments = details["attachments"]
        if not isinstance(attachments, list):
            raise ValueError("details.attachments must be a list")
        if len(attachments) > _MAX_ATTACHMENTS:
            raise ValueError(
                f"details.attachments cannot exceed {_MAX_ATTACHMENTS} items"
            )
        for entry in attachments:
            if not isinstance(entry, dict) or not isinstance(entry.get("url"), str):
                raise ValueError("Each attachment must include a valid URL string")
            if _validate_http_url(entry["url"]) is None:
                raise ValueError("Each attachment URL must be non-empty")
    return details


class ItemAttachmentSchema(BaseModel):
    """Cloud attachment metadata stored inside ItineraryItem.details.attachments."""

    model_config = ConfigDict(extra="allow")

    name: str | None = Field(default=None, max_length=200)
    url: str = Field(min_length=1, max_length=2048)

    @field_validator("url")
    @classmethod
    def _check_url(cls, value: str) -> str:
        validated = _validate_http_url(value)
        if validated is None:
            raise ValueError("Each attachment URL must be non-empty")
        return validated


class BaseItemDetails(BaseModel):
    """Shared detail fields supported across itinerary item types."""

    model_config = ConfigDict(extra="allow")

    attachments: list[ItemAttachmentSchema] | None = Field(
        default=None, max_length=_MAX_ATTACHMENTS
    )
    local_name: str | None = Field(default=None, max_length=200)
    booking_ref: str | None = Field(default=None, max_length=120)
    confirmation_code: str | None = Field(default=None, max_length=120)
    reservation_code: str | None = Field(default=None, max_length=120)
    free_cancellation_deadline: str | None = Field(default=None, max_length=100)


class FlightItemDetails(BaseItemDetails):
    """Typed details schema for FLIGHT itinerary items."""

    flight_number: str | None = Field(default=None, max_length=32)
    origin_iata: str | None = None
    dest_iata: str | None = None
    origin_terminal: str | None = Field(default=None, max_length=32)
    dest_terminal: str | None = Field(default=None, max_length=32)
    seat: str | None = Field(default=None, max_length=60)
    distance_km: float | None = Field(default=None, ge=0.0, le=50_000.0)
    airport_role: Literal["ARRIVAL", "DEPARTURE"] | None = None

    @field_validator("origin_iata", "dest_iata", mode="before")
    @classmethod
    def _check_iata(cls, value: Any) -> str | None:
        if value is None:
            return None
        if not isinstance(value, str):
            raise ValueError("IATA code must be a string")
        clean = value.strip().upper()
        if not clean:
            return None
        if not _IATA_RE.fullmatch(clean):
            raise ValueError("IATA code must be 3 alphanumeric characters")
        return clean

    @field_validator("distance_km", mode="before")
    @classmethod
    def _reject_bool_distance(cls, value: Any) -> Any:
        if isinstance(value, bool):
            raise ValueError("distance_km must be a number")
        return value


class ReservedTransitItemDetails(BaseItemDetails):
    """Typed details schema for RESERVED_TRANSIT itinerary items."""

    operator: str | None = Field(default=None, max_length=120)
    line_or_train_no: str | None = Field(default=None, max_length=120)
    car_number: str | None = Field(default=None, max_length=40)
    seat: str | None = Field(default=None, max_length=60)


class LocalTransitItemDetails(BaseItemDetails):
    """Typed details schema for LOCAL_TRANSIT connector items."""

    mode: str | None = Field(default=None, max_length=40)
    duration_minutes: int | None = Field(default=None, ge=0, le=10_080)

    @field_validator("duration_minutes", mode="before")
    @classmethod
    def _validate_duration_minutes(cls, value: Any) -> Any:
        if isinstance(value, bool):
            raise ValueError("duration_minutes must be an integer")
        if isinstance(value, float) and not value.is_integer():
            raise ValueError("duration_minutes must be a whole integer")
        return value


class StayItemDetails(BaseItemDetails):
    """Typed details schema for STAY accommodation items."""

    check_in_time: str | None = Field(default=None, max_length=16)
    check_out_time: str | None = Field(default=None, max_length=16)

    @field_validator("check_in_time", "check_out_time")
    @classmethod
    def _check_stay_time(cls, value: str | None) -> str | None:
        return _normalize_time_str(value)


class FoodItemDetails(BaseItemDetails):
    """Typed details schema for FOOD dining items."""

    reservation_required: bool | None = None


class SpotItemDetails(BaseItemDetails):
    """Typed details schema for SPOT sightseeing items."""


DETAIL_MODEL_BY_TYPE: dict[ItemType, type[BaseItemDetails]] = {
    ItemType.FLIGHT: FlightItemDetails,
    ItemType.RESERVED_TRANSIT: ReservedTransitItemDetails,
    ItemType.LOCAL_TRANSIT: LocalTransitItemDetails,
    ItemType.STAY: StayItemDetails,
    ItemType.FOOD: FoodItemDetails,
    ItemType.SPOT: SpotItemDetails,
}


def validate_item_details_for_type(
    item_type: ItemType, details: dict[str, Any]
) -> dict[str, Any]:
    """Validate and normalize an item's details dict against its ItemType schema."""
    _validate_details_size(details)
    model_cls = DETAIL_MODEL_BY_TYPE.get(item_type, BaseItemDetails)
    validated = model_cls.model_validate(details)
    return validated.model_dump(exclude_unset=True, exclude_none=True)


def _normalize_country_codes(values: list[str]) -> list[str]:
    normalized: list[str] = []
    for code in values:
        clean = code.strip().upper()
        if len(clean) != ISO_COUNTRY_CODE_LENGTH:
            raise ValueError(f"Invalid ISO-2 country code: {code}")
        if clean not in normalized:
            normalized.append(clean)
    return normalized


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
    notes: str | None = Field(default=None, max_length=MAX_NOTES_LENGTH)
    details: dict[str, Any] = Field(default_factory=dict)
    choice_group_id: str | None = Field(default=None, max_length=36)
    # Optional ID of an existing item to group with as a slot-level alternative.
    alternative_for_item_id: str | None = None
    is_selected: bool = True

    @field_validator("start_time", "end_time")
    @classmethod
    def _check_time_str(cls, value: str | None) -> str | None:
        return _normalize_time_str(value)

    @field_validator("google_maps_url")
    @classmethod
    def _check_google_maps_url(cls, value: str | None) -> str | None:
        return _validate_http_url(value)

    @field_validator("details")
    @classmethod
    def _check_details(cls, value: dict[str, Any]) -> dict[str, Any]:
        return _validate_details_attachments(value)

    @model_validator(mode="after")
    def _validate_typed_details(self) -> "ItineraryItemCreate":
        self.details = validate_item_details_for_type(self.type, self.details)
        return self


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
    notes: str | None = Field(default=None, max_length=MAX_NOTES_LENGTH)
    details: dict[str, Any] | None = None
    choice_group_id: str | None = None
    is_selected: bool | None = None

    @field_validator("start_time", "end_time")
    @classmethod
    def _check_time_str(cls, value: str | None) -> str | None:
        return _normalize_time_str(value)

    @field_validator("google_maps_url")
    @classmethod
    def _check_google_maps_url(cls, value: str | None) -> str | None:
        return _validate_http_url(value)

    @field_validator("details")
    @classmethod
    def _check_details(cls, value: dict[str, Any] | None) -> dict[str, Any] | None:
        return _validate_details_attachments(value) if value is not None else None

    @model_validator(mode="after")
    def _validate_typed_details(self) -> "ItineraryItemUpdate":
        if self.type is not None and self.details is not None:
            self.details = validate_item_details_for_type(self.type, self.details)
        return self


class ItineraryItemReorderRequest(BaseModel):
    item_ids: list[str] = Field(min_length=1)


class ItineraryItemMoveRequest(BaseModel):
    target_option_id: str = Field(min_length=1, max_length=36)
    sort_order: int | None = Field(default=None, ge=0)


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

    @model_validator(mode="after")
    def _populate_flight_airport_role(self) -> "ItineraryItemResponse":
        if self.type == ItemType.FLIGHT and "airport_role" not in self.details:
            role = infer_flight_airport_role(
                self.details, self.latitude, self.longitude
            )
            if role:
                self.details = {**self.details, "airport_role": role}
        return self


class DayOptionCreate(BaseModel):
    label: str = Field(min_length=1, max_length=80)
    summary_notes: str | None = Field(default=None, max_length=MAX_NOTES_LENGTH)


class DayOptionCloneRequest(BaseModel):
    label: str = Field(min_length=1, max_length=80)


class DayOptionUpdate(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=80)
    summary_notes: str | None = Field(default=None, max_length=MAX_NOTES_LENGTH)


class ActiveOptionUpdate(BaseModel):
    day_option_id: str


class TripDayUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=160)
    notes: str | None = Field(default=None, max_length=MAX_NOTES_LENGTH)


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
    default_currency: str = Field(
        default="JPY",
        min_length=ISO_CURRENCY_CODE_LENGTH,
        max_length=ISO_CURRENCY_CODE_LENGTH,
    )
    cover_image_url: str | None = Field(default=None, max_length=500)
    status: TripStatus = TripStatus.PLANNING
    notes: str | None = Field(default=None, max_length=MAX_NOTES_LENGTH)

    @field_validator("default_currency")
    @classmethod
    def _upper_currency(cls, value: str) -> str:
        return value.upper()

    @field_validator("cover_image_url")
    @classmethod
    def _check_cover_url(cls, value: str | None) -> str | None:
        return _validate_http_url(value)

    @field_validator("country_codes")
    @classmethod
    def _upper_countries(cls, values: list[str]) -> list[str]:
        return _normalize_country_codes(values)

    @model_validator(mode="after")
    def _validate_date_range(self) -> "TripCreate":
        if self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        if (self.end_date - self.start_date).days > MAX_TRIP_DATE_SPAN_DAYS:
            raise ValueError(
                f"Trip duration cannot exceed {MAX_TRIP_DATE_SPAN_DAYS + 1} days"
            )
        return self


class TripUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    destination_summary: str | None = Field(default=None, max_length=200)
    country_codes: list[str] | None = None
    start_date: date | None = None
    default_currency: str | None = Field(
        default=None,
        min_length=ISO_CURRENCY_CODE_LENGTH,
        max_length=ISO_CURRENCY_CODE_LENGTH,
    )
    cover_image_url: str | None = Field(default=None, max_length=500)
    status: TripStatus | None = None
    notes: str | None = Field(default=None, max_length=MAX_NOTES_LENGTH)

    @field_validator("default_currency")
    @classmethod
    def _upper_currency(cls, value: str | None) -> str | None:
        return value.upper() if value is not None else None

    @field_validator("cover_image_url")
    @classmethod
    def _check_cover_url(cls, value: str | None) -> str | None:
        return _validate_http_url(value)

    @field_validator("country_codes")
    @classmethod
    def _upper_countries(cls, values: list[str] | None) -> list[str] | None:
        return _normalize_country_codes(values) if values is not None else None


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
