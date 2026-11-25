"""Async SQLAlchemy engine, session factory, and declarative base."""

import re
from collections.abc import AsyncGenerator
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import MetaData, event
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings

NAMING_CONVENTION: dict[str, str] = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


_SCHEMA_NAME_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def _build_metadata() -> MetaData:
    settings = get_settings()
    # SQLite does not support PostgreSQL schemas; apply db_schema only on Postgres.
    schema: str | None = None
    if settings.db_schema and not settings.database_url.startswith("sqlite"):
        if not _SCHEMA_NAME_RE.fullmatch(settings.db_schema):
            raise ValueError(f"Invalid DB_SCHEMA identifier: {settings.db_schema}")
        schema = settings.db_schema
    return MetaData(naming_convention=NAMING_CONVENTION, schema=schema)


class Base(DeclarativeBase):
    """Base ORM class shared by all Tripilot database models."""

    metadata = _build_metadata()


def configure_sqlite_foreign_keys(target_engine: AsyncEngine) -> None:
    """Enforce SQLite foreign-key constraints so local dev/tests match PostgreSQL."""

    @event.listens_for(target_engine.sync_engine, "connect")
    def _enable_sqlite_fk(dbapi_connection: Any, _: Any) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


def create_engine_from_settings() -> AsyncEngine:
    """Create the async SQLAlchemy engine configured for SQLite or PostgreSQL."""
    settings = get_settings()
    connect_args: dict[str, object] = {}
    is_sqlite = settings.database_url.startswith("sqlite")
    if is_sqlite:
        connect_args["check_same_thread"] = False
    elif "asyncpg" in settings.database_url:
        # Required for Supabase Transaction Pooler (port 6543 / PgBouncer).
        connect_args["statement_cache_size"] = 0

    engine_kwargs: dict[str, Any] = {
        "echo": False,
        "pool_pre_ping": True,
        "connect_args": connect_args,
    }
    if not is_sqlite:
        engine_kwargs.update(
            {
                "pool_size": 5,
                "max_overflow": 10,
                "pool_timeout": 15,
                "pool_recycle": 1800,
            }
        )

    async_engine = create_async_engine(settings.database_url, **engine_kwargs)
    if is_sqlite:
        configure_sqlite_foreign_keys(async_engine)
    return async_engine


engine: AsyncEngine = create_engine_from_settings()
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Yield an async database session scoped to a single request."""
    async with AsyncSessionLocal() as session:
        yield session


def utcnow() -> datetime:
    """Return the current timezone-aware UTC timestamp."""
    return datetime.now(UTC)
