"""Schemas for user profile and Personal API Token management."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.auth import ALL_SCOPES
from app.models.enums import UserRole


class UserProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str | None
    display_name: str | None
    role: UserRole
    is_active: bool
    last_login_at: datetime | None
    home_country_code: str
    home_currency: str
    created_at: datetime


class UserProfileUpdate(BaseModel):
    display_name: str | None = Field(default=None, max_length=120)
    home_country_code: str | None = Field(default=None, min_length=2, max_length=2)
    home_currency: str | None = Field(default=None, min_length=3, max_length=3)

    @field_validator("home_country_code", "home_currency")
    @classmethod
    def _uppercase_iso(cls, value: str | None) -> str | None:
        return value.upper() if value is not None else None


class ApiTokenCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    scopes: list[str] = Field(default_factory=lambda: list(ALL_SCOPES))
    expires_at: datetime | None = None

    @field_validator("scopes")
    @classmethod
    def _validate_scopes(cls, scopes: list[str]) -> list[str]:
        invalid = [scope for scope in scopes if scope not in ALL_SCOPES]
        if invalid:
            raise ValueError(f"Unsupported scopes: {', '.join(invalid)}")
        if not scopes:
            raise ValueError("At least one scope must be selected")
        return list(dict.fromkeys(scopes))


class ApiTokenResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    token_prefix: str
    scopes: list[str]
    last_used_at: datetime | None
    expires_at: datetime | None
    revoked_at: datetime | None
    created_at: datetime


class ApiTokenCreatedResponse(ApiTokenResponse):
    """Returned once upon token creation; plaintext is never retrievable again."""

    plaintext_token: str
