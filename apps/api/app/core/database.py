"""Async SQLAlchemy engine, session factory, and declarative base."""

from collections.abc import AsyncGenerator

from sqlalchemy import MetaData
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


def _build_metadata() -> MetaData:
    settings = get_settings()
    # SQLite does not support PostgreSQL schemas; apply db_schema only on Postgres.
    schema = (
        settings.db_schema
        if settings.db_schema and not settings.database_url.startswith("sqlite")
        else None
    )
    return MetaData(naming_convention=NAMING_CONVENTION, schema=schema)


class Base(DeclarativeBase):
    """Base ORM class shared by all Tripilot database models."""

    metadata = _build_metadata()


def create_engine_from_settings() -> AsyncEngine:
    """Create the async SQLAlchemy engine configured for SQLite or PostgreSQL."""
    settings = get_settings()
    connect_args: dict[str, object] = {}
    if settings.database_url.startswith("sqlite"):
        connect_args["check_same_thread"] = False
    elif "asyncpg" in settings.database_url:
        # Required for Supabase Transaction Pooler (port 6543 / PgBouncer).
        connect_args["statement_cache_size"] = 0

    return create_async_engine(
        settings.database_url,
        echo=False,
        pool_pre_ping=True,
        connect_args=connect_args,
    )


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
