"""Unit tests for outbound HTTP pool retries, circuit breaker, and error mapping."""

import asyncio
from collections.abc import Generator
from unittest.mock import patch

import httpx
import pytest

from app.core.constants import (
    CIRCUIT_BREAKER_FAILURE_THRESHOLD,
    CIRCUIT_BREAKER_RECOVERY_SEC,
)
from app.core.http_client import (
    UpstreamUnavailableError,
    get_circuit_breaker,
    request_with_resilience,
    reset_circuit_breakers,
)


@pytest.fixture(autouse=True)
def _clean_circuit_breakers() -> Generator[None, None, None]:
    reset_circuit_breakers()
    yield
    reset_circuit_breakers()


@pytest.mark.asyncio
async def test_transient_503_retries_and_succeeds_on_200() -> None:
    attempts = 0

    def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            return httpx.Response(503, json={"error": "overloaded"})
        return httpx.Response(200, json={"ok": True})

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as client:
        response = await request_with_resilience(
            "test-retry",
            "GET",
            "https://example.test/data",
            client=client,
            max_attempts=2,
            backoff_sec=0.0,
        )

    assert attempts == 2
    assert response.status_code == 200
    assert response.json() == {"ok": True}
    breaker = get_circuit_breaker("test-retry")
    assert breaker.state == "closed"
    assert breaker.failure_count == 0


@pytest.mark.asyncio
async def test_circuit_breaker_opens_and_recovers_after_cooldown(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    now = 100.0
    monkeypatch.setattr("app.core.http_client.time.monotonic", lambda: now)

    transport_calls = 0
    return_ok = False

    def handler(_request: httpx.Request) -> httpx.Response:
        nonlocal transport_calls
        transport_calls += 1
        if return_ok:
            return httpx.Response(200, json={"recovered": True})
        return httpx.Response(503, json={"error": "down"})

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as client:
        for _ in range(CIRCUIT_BREAKER_FAILURE_THRESHOLD):
            resp = await request_with_resilience(
                "test-breaker",
                "GET",
                "https://example.test/health",
                client=client,
                max_attempts=1,
                backoff_sec=0.0,
            )
            assert resp.status_code == 503

        calls_when_opened = transport_calls
        assert calls_when_opened == CIRCUIT_BREAKER_FAILURE_THRESHOLD
        assert get_circuit_breaker("test-breaker").state == "open"

        # Circuit breaker fails fast without touching the HTTP transport.
        with pytest.raises(UpstreamUnavailableError):
            await request_with_resilience(
                "test-breaker",
                "GET",
                "https://example.test/health",
                client=client,
                max_attempts=1,
                backoff_sec=0.0,
            )
        assert transport_calls == calls_when_opened

        # Advance monotonic clock past cooldown so a half-open probe succeeds.
        now += CIRCUIT_BREAKER_RECOVERY_SEC + 1.0
        return_ok = True
        recovered = await request_with_resilience(
            "test-breaker",
            "GET",
            "https://example.test/health",
            client=client,
            max_attempts=1,
            backoff_sec=0.0,
        )

    assert recovered.status_code == 200
    assert recovered.json() == {"recovered": True}
    assert transport_calls == calls_when_opened + 1
    breaker = get_circuit_breaker("test-breaker")
    assert breaker.state == "closed"
    assert breaker.failure_count == 0


@pytest.mark.asyncio
async def test_places_search_maps_circuit_open_to_503(
    api_client: httpx.AsyncClient, dev_headers: dict[str, str]
) -> None:
    class _BreakerOpenProvider:
        async def search(
            self, query: str, language: str = "zh-TW", limit: int = 5
        ) -> list[object]:
            del query, language, limit
            raise UpstreamUnavailableError("google_places")

    with patch(
        "app.api.v1.places.get_place_search_provider",
        return_value=_BreakerOpenProvider(),
    ):
        resp = await api_client.get(
            "/api/v1/places/search?q=Tokyo", headers=dev_headers
        )

    assert resp.status_code == 503


@pytest.mark.asyncio
async def test_half_open_circuit_allows_single_probe_only(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    now = 200.0
    monkeypatch.setattr("app.core.http_client.time.monotonic", lambda: now)

    breaker = get_circuit_breaker("test-half-open-single")
    for _ in range(CIRCUIT_BREAKER_FAILURE_THRESHOLD):
        breaker.record_failure()
    assert breaker.state == "open"

    now += CIRCUIT_BREAKER_RECOVERY_SEC + 1.0
    probe_started = asyncio.Event()
    release_probe = asyncio.Event()

    async def _slow_transport(_request: httpx.Request) -> httpx.Response:
        probe_started.set()
        await release_probe.wait()
        return httpx.Response(200, json={"ok": True})

    transport = httpx.MockTransport(_slow_transport)
    async with httpx.AsyncClient(transport=transport) as client:
        probe_task = asyncio.create_task(
            request_with_resilience(
                "test-half-open-single",
                "GET",
                "https://example.test/probe",
                client=client,
                max_attempts=1,
                backoff_sec=0.0,
            )
        )
        await probe_started.wait()
        assert breaker.state == "half_open"

        # Concurrent callers must fail fast while the single half-open probe runs.
        with pytest.raises(UpstreamUnavailableError):
            await request_with_resilience(
                "test-half-open-single",
                "GET",
                "https://example.test/probe",
                client=client,
                max_attempts=1,
                backoff_sec=0.0,
            )

        release_probe.set()
        probe_resp = await probe_task

    assert probe_resp.status_code == 200
    assert breaker.state == "closed"
