"""Application configuration loaded from environment variables."""

from functools import lru_cache
from typing import Any, Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Typed runtime settings with fail-closed defaults for production."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "Tripilot API"
    app_version: str = "0.9.9-beta"
    app_env: Literal["DEV", "PROD"] = "PROD"

    # Strictly honored only when app_env == "DEV".
    dev_user_id: str | None = None

    database_url: str = "sqlite+aiosqlite:///./tripilot.db"
    # Optional PostgreSQL schema for sharing an existing Supabase/Postgres DB.
    db_schema: str | None = None

    cors_origins: str = "http://localhost:4200"
    osrm_base_url: str = "https://router.project-osrm.org"
    google_places_api_key: str | None = None
    firebase_credentials_path: str | None = None

    # Comma-separated developer/admin emails (always exempt from rate limits).
    admin_emails: str = ""
    # Optional invite-only allowlist; when non-empty, unlisted Firebase users get 403.
    allowed_emails: str = ""
    # When None, rate limiting defaults to enabled in PROD and disabled in DEV.
    rate_limit_enabled: bool | None = None
    rate_limit_places_per_min: int = 30
    rate_limit_public_per_min: int = 60

    @field_validator(
        "db_schema",
        "dev_user_id",
        "google_places_api_key",
        "firebase_credentials_path",
        "rate_limit_enabled",
        mode="before",
    )
    @classmethod
    def _empty_string_to_none(cls, value: Any) -> Any:
        if isinstance(value, str):
            stripped = value.strip()
            return stripped if stripped else None
        return value

    @property
    def is_dev(self) -> bool:
        return self.app_env == "DEV"

    @property
    def is_rate_limit_enabled(self) -> bool:
        return (
            self.rate_limit_enabled
            if self.rate_limit_enabled is not None
            else (not self.is_dev)
        )

    @property
    def admin_email_set(self) -> frozenset[str]:
        return frozenset(
            email.strip().lower()
            for email in self.admin_emails.split(",")
            if email.strip()
        )

    @property
    def allowed_email_set(self) -> frozenset[str]:
        return frozenset(
            email.strip().lower()
            for email in self.allowed_emails.split(",")
            if email.strip()
        )

    @property
    def cors_origin_list(self) -> list[str]:
        return [
            origin.strip()
            for origin in self.cors_origins.split(",")
            if origin.strip()
        ]


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance."""
    return Settings()
