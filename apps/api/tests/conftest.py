"""Shared pytest fixtures for async FastAPI and SQLite integration tests."""

from collections.abc import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import Settings, get_settings
from app.core.database import Base, configure_sqlite_foreign_keys, get_db
from app.main import create_app


@pytest.fixture
async def api_client() -> AsyncGenerator[AsyncClient, None]:
    """Yield an AsyncClient backed by a fresh in-memory SQLite database."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    configure_sqlite_foreign_keys(engine)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async def _override_db() -> AsyncGenerator[AsyncSession, None]:
        async with session_factory() as session:
            yield session

    test_settings = Settings(
        app_env="DEV",
        dev_user_id="dev-test-user",
        database_url="sqlite+aiosqlite:///:memory:",
    )

    app = create_app()
    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_settings] = lambda: test_settings

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client

    await engine.dispose()


@pytest.fixture
def dev_headers() -> dict[str, str]:
    """Authorization header for the local DEV test user."""
    return {"Authorization": "Bearer dev-test-user"}
