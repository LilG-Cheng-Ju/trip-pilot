"""Smoke tests for the system health endpoint."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_healthz_returns_ok(api_client: AsyncClient) -> None:
    response = await api_client.get("/healthz")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["service"] == "tripilot-api"
