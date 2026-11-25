"""Pydantic schemas for invite code redemption and Admin Console management."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.constants import INVITE_BATCH_MAX_COUNT
from app.models.enums import UserRole

InviteStatus = Literal["available", "used", "expired", "revoked"]


class InviteRedeemRequest(BaseModel):
    code: str = Field(min_length=4, max_length=32)

    @field_validator("code")
    @classmethod
    def _normalize_code(cls, value: str) -> str:
        normalized = value.strip().upper()
        if len(normalized) < 4:
            raise ValueError("Invite code is too short")
        return normalized


class InviteCodeBatchCreate(BaseModel):
    count: int = Field(default=1, ge=1, le=INVITE_BATCH_MAX_COUNT)
    note: str | None = Field(default=None, max_length=160)
    expires_in_days: int | None = Field(default=None, ge=1, le=365)


class InviteCodeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    code: str
    note: str | None
    is_used: bool
    used_by_user_id: str | None
    used_by_email: str | None = None
    used_at: datetime | None
    expires_at: datetime | None
    revoked_at: datetime | None
    created_at: datetime
    status: InviteStatus


class AdminUserItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str | None
    display_name: str | None
    role: UserRole
    is_active: bool
    trip_count: int
    active_token_count: int
    last_login_at: datetime | None
    created_at: datetime


class AdminUserListResponse(BaseModel):
    total: int
    active_friends_count: int
    available_invites_count: int
    items: list[AdminUserItem]


class AdminUserUpdate(BaseModel):
    role: UserRole | None = None
    is_active: bool | None = None
