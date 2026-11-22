"""Unit tests for TripilotClient using httpx.MockTransport."""

from __future__ import annotations

import json
from typing import Any

import httpx
import pytest

from tripilot_mcp.client import TripilotAPIError, TripilotClient


def _sample_trip() -> dict[str, Any]:
    return {
        "id": "trip-1",
        "title": "Tokyo Autumn 2026",
        "destination_summary": "Tokyo & Nikko",
        "country_codes": ["JP"],
        "start_date": "2026-10-10",
        "end_date": "2026-10-12",
        "default_currency": "JPY",
        "status": "PLANNING",
        "days": [
            {
                "id": "day-1",
                "trip_id": "trip-1",
                "day_index": 1,
                "date": "2026-10-10",
                "title": "Arrival",
                "active_option_id": "opt-1a",
                "options": [
                    {
                        "id": "opt-1a",
                        "trip_day_id": "day-1",
                        "label": "Plan A",
                        "sort_order": 0,
                        "items": [],
                    },
                    {
                        "id": "opt-1b",
                        "trip_day_id": "day-1",
                        "label": "Plan B - Rainy Day",
                        "sort_order": 1,
                        "items": [],
                    },
                ],
            }
        ],
    }


async def test_client_sends_bearer_auth_header() -> None:
    captured_headers: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured_headers.update(dict(request.headers))
        assert request.url.path == "/api/v1/trips"
        return httpx.Response(200, json=[])

    transport = httpx.MockTransport(handler)
    async with TripilotClient(
        base_url="https://api.tripilot.test",
        api_token="tp_pat_secret123",
        transport=transport,
    ) as client:
        trips = await client.list_trips()

    assert trips == []
    assert captured_headers["authorization"] == "Bearer tp_pat_secret123"


async def test_client_omits_auth_header_when_token_empty() -> None:
    captured_headers: dict[str, str] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured_headers.update(dict(request.headers))
        return httpx.Response(200, json=[])

    transport = httpx.MockTransport(handler)
    async with TripilotClient(
        base_url="http://localhost:8000",
        api_token="",
        transport=transport,
    ) as client:
        await client.list_trips()

    assert "authorization" not in captured_headers


async def test_add_item_by_date_uses_active_option_by_default() -> None:
    calls: list[tuple[str, str, dict[str, Any] | None]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode("utf-8")) if request.content else None
        calls.append((request.method, request.url.path, body))
        if request.method == "GET" and request.url.path == "/api/v1/trips/trip-1":
            return httpx.Response(200, json=_sample_trip())
        if (
            request.method == "POST"
            and request.url.path == "/api/v1/options/opt-1a/items"
        ):
            return httpx.Response(
                201,
                json={"id": "item-1", "day_option_id": "opt-1a", **(body or {})},
            )
        return httpx.Response(404, json={"detail": "Unexpected route"})

    transport = httpx.MockTransport(handler)
    async with TripilotClient(
        base_url="http://localhost:8000",
        api_token="tp_pat_test",
        transport=transport,
    ) as client:
        created = await client.add_item_by_date(
            trip_id="trip-1",
            target_date="2026-10-10",
            payload={
                "type": "FLIGHT",
                "title": "JL802 TPE -> NRT",
                "details": {"dep_iata": "TPE", "arr_iata": "NRT"},
            },
        )

    assert created["id"] == "item-1"
    assert created["day_option_id"] == "opt-1a"
    assert calls[0][:2] == ("GET", "/api/v1/trips/trip-1")
    assert calls[1][:2] == ("POST", "/api/v1/options/opt-1a/items")


async def test_add_item_by_date_resolves_named_option_case_insensitively() -> None:
    posted_paths: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "GET" and request.url.path == "/api/v1/trips/trip-1":
            return httpx.Response(200, json=_sample_trip())
        if request.method == "POST":
            posted_paths.append(request.url.path)
            body = json.loads(request.content.decode("utf-8"))
            return httpx.Response(
                201,
                json={"id": "item-2", "day_option_id": "opt-1b", **body},
            )
        return httpx.Response(404, json={"detail": "Not found"})

    transport = httpx.MockTransport(handler)
    async with TripilotClient(
        base_url="http://localhost:8000",
        api_token="tp_pat_test",
        transport=transport,
    ) as client:
        created = await client.add_item_by_date(
            trip_id="trip-1",
            target_date="2026-10-10",
            option_label="plan b - rainy day",
            payload={"type": "SPOT", "title": "teamLab Planets"},
        )

    assert posted_paths == ["/api/v1/options/opt-1b/items"]
    assert created["day_option_id"] == "opt-1b"
    assert created["title"] == "teamLab Planets"


async def test_add_item_by_date_raises_on_missing_date_or_option() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=_sample_trip())

    transport = httpx.MockTransport(handler)
    async with TripilotClient(
        base_url="http://localhost:8000",
        api_token="tp_pat_test",
        transport=transport,
    ) as client:
        with pytest.raises(ValueError, match="2026-10-15"):
            await client.add_item_by_date(
                trip_id="trip-1",
                target_date="2026-10-15",
                payload={"type": "SPOT", "title": "Missing day"},
            )

        with pytest.raises(ValueError, match="Plan C"):
            await client.add_item_by_date(
                trip_id="trip-1",
                target_date="2026-10-10",
                option_label="Plan C",
                payload={"type": "SPOT", "title": "Missing option"},
            )


async def test_create_trip_normalizes_codes_and_returns_response() -> None:
    captured_body: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "POST"
        assert request.url.path == "/api/v1/trips"
        captured_body.update(json.loads(request.content.decode("utf-8")))
        return httpx.Response(201, json={"id": "trip-new", **captured_body})

    transport = httpx.MockTransport(handler)
    async with TripilotClient(
        base_url="http://localhost:8000",
        api_token="tp_pat_test",
        transport=transport,
    ) as client:
        trip = await client.create_trip(
            title="Kyoto Spring",
            start_date="2026-04-01",
            end_date="2026-04-05",
            country_codes=["jp"],
            default_currency="jpy",
            destination_summary="Kyoto & Nara",
        )

    assert trip["id"] == "trip-new"
    assert captured_body == {
        "title": "Kyoto Spring",
        "start_date": "2026-04-01",
        "end_date": "2026-04-05",
        "country_codes": ["JP"],
        "default_currency": "JPY",
        "status": "PLANNING",
        "destination_summary": "Kyoto & Nara",
    }


async def test_log_expense_posts_payload_and_raises_api_error_on_failure() -> None:
    captured_body: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/v1/trips/trip-1/expenses":
            assert request.method == "POST"
            captured_body.update(json.loads(request.content.decode("utf-8")))
            return httpx.Response(
                201,
                json={
                    "id": "exp-1",
                    "trip_id": "trip-1",
                    "amount_home": "1050.00",
                    "currency_home": "TWD",
                    **captured_body,
                },
            )
        return httpx.Response(404, json={"detail": "Trip not found"})

    transport = httpx.MockTransport(handler)
    async with TripilotClient(
        base_url="http://localhost:8000",
        api_token="tp_pat_test",
        transport=transport,
    ) as client:
        expense = await client.log_expense(
            trip_id="trip-1",
            payload={
                "title": "Narita Express Roundtrip",
                "category": "TRANSIT",
                "amount_original": 5000,
                "currency_original": "JPY",
                "exchange_rate": 0.21,
                "payment_method": "Suica",
            },
        )
        assert expense["id"] == "exp-1"
        assert captured_body["amount_original"] == 5000
        assert captured_body["currency_original"] == "JPY"

        with pytest.raises(TripilotAPIError) as exc_info:
            await client.log_expense(
                trip_id="trip-missing",
                payload={"title": "Test", "category": "OTHER"},
            )

    assert exc_info.value.status_code == 404
    assert "Trip not found" in exc_info.value.detail
