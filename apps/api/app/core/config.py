"""Application configuration loaded from environment variables."""

from functools import lru_cache
from typing import Literal

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
    app_version: str = "0.6.6-beta"
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

    @field_validator(
        "db_schema",
        "dev_user_id",
        "google_places_api_key",
        "firebase_credentials_path",
    )
    @classmethod
    def _empty_string_to_none(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped if stripped else None

    @property
    def is_dev(self) -> bool:
        return self.app_env == "DEV"

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
