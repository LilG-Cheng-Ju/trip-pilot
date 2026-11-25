"""Tests for FX exchange rate lookup endpoint and caching."""

import asyncio
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from httpx import AsyncClient

from app.services.fx_service import OpenErApiProvider, _round_rate


def test_round_rate_preserves_precision_for_micro_currencies() -> None:
    assert _round_rate(0.215432) == 0.2154
    assert _round_rate(0.00003937) == 0.00003937


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


@pytest.mark.asyncio
async def test_fx_provider_deduplicates_concurrent_lookups_and_bounds_cache() -> None:
    provider = OpenErApiProvider(ttl_seconds=60, max_cache_entries=2)
    upstream_calls = 0

    async def _fake_request(*_args: object, **_kwargs: object) -> httpx.Response:
        nonlocal upstream_calls
        upstream_calls += 1
        await asyncio.sleep(0.02)
        base = str(_args[2]).rsplit("/", maxsplit=1)[-1]
        return httpx.Response(200, json={"rates": {"TWD": 0.22, "USD": 0.007, base: 1}})

    with patch(
        "app.services.fx_service.request_with_resilience",
        side_effect=_fake_request,
    ):
        results = await asyncio.gather(
            *(provider.get_rate("JPY", "TWD") for _ in range(8))
        )
        assert upstream_calls == 1
        assert all(rate == 0.22 for rate, _, _ in results)

        # Filling past max_cache_entries=2 evicts the oldest base currency.
        await provider.get_rate("EUR", "TWD")
        await provider.get_rate("KRW", "TWD")
        assert len(provider._cache) == 2
        assert "JPY" not in provider._cache
