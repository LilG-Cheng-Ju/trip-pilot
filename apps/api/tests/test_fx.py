"""Tests for FX exchange rate lookup endpoint and caching."""

from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_fx_rate_requires_auth_and_returns_rate(
    api_client: AsyncClient, dev_headers: dict[str, str]
) -> None:
    unauth = await api_client.get("/api/v1/fx/rate?from=JPY&to=TWD")
    assert unauth.status_code == 401

    same = await api_client.get("/api/v1/fx/rate?from=TWD&to=TWD", headers=dev_headers)
    assert same.status_code == 200
    assert same.json()["rate"] == 1.0

    with patch(
        "app.services.fx_service.OpenErApiProvider.get_rate",
        new=AsyncMock(return_value=(0.2135, "open_er_api", False)),
    ):
        resp = await api_client.get(
            "/api/v1/fx/rate?from=jpy&to=twd", headers=dev_headers
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["from_currency"] == "JPY"
    assert body["to_currency"] == "TWD"
    assert body["rate"] == 0.2135
