"""Async Alembic migration environment configured from app settings."""

import asyncio
import re
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool, text
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

# Import all models so Base.metadata registers every table.
import app.models  # noqa: F401
from app.core.config import get_settings
from app.core.database import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

_SCHEMA_NAME_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def _get_database_url() -> str:
    return get_settings().database_url


def _validated_pg_schema() -> str | None:
    """Return a validated PostgreSQL schema name when DB_SCHEMA is configured."""
    settings = get_settings()
    if not settings.db_schema or settings.database_url.startswith("sqlite"):
        return None
    if not _SCHEMA_NAME_RE.fullmatch(settings.db_schema):
        raise ValueError(f"Invalid DB_SCHEMA identifier: {settings.db_schema}")
    return settings.db_schema


def run_migrations_offline() -> None:
    """Run migrations in offline SQL-script mode."""
    context.configure(
        url=_get_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_schemas=True,
        version_table_schema=_validated_pg_schema(),
    )
    with context.begin_transaction():
        context.run_migrations()


def _do_run_migrations(connection: Connection) -> None:
    schema = _validated_pg_schema()
    if schema and connection.dialect.name == "postgresql":
        # Scope unqualified migration tables and alembic_version to this schema.
        connection.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema}"'))
        connection.execute(text(f'SET search_path TO "{schema}"'))
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        include_schemas=True,
        version_table_schema=schema,
        render_as_batch=connection.dialect.name == "sqlite",
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Run migrations using an async SQLAlchemy engine."""
    section = config.get_section(config.config_ini_section, {})
    db_url = _get_database_url()
    section["sqlalchemy.url"] = db_url
    connect_args: dict[str, object] = {}
    if "asyncpg" in db_url:
        connect_args["statement_cache_size"] = 0
    connectable = async_engine_from_config(
        section,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        connect_args=connect_args,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(_do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    """Run migrations in online mode."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
