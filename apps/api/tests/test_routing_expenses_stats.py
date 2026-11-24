"""Tests for IATA flight distance, routing cache, expenses, and annual stats."""

from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

from app.services.routing import RouteLegResult


@pytest.mark.asyncio
async def test_airport_search_and_flight_great_circle(
    api_client: AsyncClient, dev_headers: dict[str, str]
) -> None:
    search_resp = await api_client.get("/api/v1/airports/search?q=HND")
    assert search_resp.status_code == 200
    results = search_resp.json()
    assert results[0]["iata"] == "HND"
    assert results[0]["country_code"] == "JP"

    trip = (
        await api_client.post(
            "/api/v1/trips",
            headers=dev_headers,
            json={
                "title": "Tokyo Weekend",
                "country_codes": ["JP"],
                "start_date": "2026-11-24",
                "end_date": "2026-11-26",
            },
        )
    ).json()
    plan_a_id = trip["days"][0]["active_option_id"]

    flight_resp = await api_client.post(
        f"/api/v1/options/{plan_a_id}/items",
        headers=dev_headers,
        json={
            "type": "FLIGHT",
            "title": "NH852 TSA -> HND",
            "details": {"origin_iata": "tsa", "dest_iata": "hnd"},
        },
    )
    assert flight_resp.status_code == 201
    details = flight_resp.json()["details"]
    assert details["origin_iata"] == "TSA"
    assert details["dest_iata"] == "HND"
    # Great-circle distance TSA <-> HND is approximately 2,095 km.
    assert 2080.0 <= details["distance_km"] <= 2120.0


@pytest.mark.asyncio
async def test_ground_routing_cache_expenses_and_annual_stats(
    api_client: AsyncClient, dev_headers: dict[str, str]
) -> None:
    # Create an international trip (JP) and a domestic trip (TW).
    jp_trip = (
        await api_client.post(
            "/api/v1/trips",
            headers=dev_headers,
            json={
                "title": "Izu Peninsula",
                "country_codes": ["JP"],
                "start_date": "2026-11-24",
                "end_date": "2026-11-25",
                "default_currency": "JPY",
            },
        )
    ).json()
    await api_client.post(
        "/api/v1/trips",
        headers=dev_headers,
        json={
            "title": "Tainan Food Run",
            "country_codes": ["TW"],
            "start_date": "2026-08-01",
            "end_date": "2026-08-02",
            "default_currency": "TWD",
        },
    )

    day1 = jp_trip["days"][0]
    plan_a_id = day1["active_option_id"]

    # Mock OSRM routing so the test is deterministic and offline.
    mock_leg = RouteLegResult(
        distance_km=12.4,
        duration_min=22,
        geometry_polyline="mock_polyline",
        is_approx=False,
    )
    with patch(
        "app.services.routing.OsrmRoutingProvider.compute_leg",
        new=AsyncMock(return_value=mock_leg),
    ):
        await api_client.post(
            f"/api/v1/options/{plan_a_id}/items",
            headers=dev_headers,
            json={
                "type": "SPOT",
                "title": "Tokyo Station",
                "latitude": 35.6812,
                "longitude": 139.7671,
            },
        )
        await api_client.post(
            f"/api/v1/options/{plan_a_id}/items",
            headers=dev_headers,
            json={
                "type": "FOOD",
                "title": "Ginza Ramen",
                "latitude": 35.6717,
                "longitude": 139.7650,
            },
        )

    # Add an active flight to Plan A and a backup flight to Plan B (not active).
    await api_client.post(
        f"/api/v1/options/{plan_a_id}/items",
        headers=dev_headers,
        json={
            "type": "FLIGHT",
            "title": "Active Flight",
            "details": {"origin_iata": "TSA", "dest_iata": "HND"},
        },
    )
    plan_b = (
        await api_client.post(
            f"/api/v1/days/{day1['id']}/options",
            headers=dev_headers,
            json={"label": "Plan B · Backup"},
        )
    ).json()
    await api_client.post(
        f"/api/v1/options/{plan_b['id']}/items",
        headers=dev_headers,
        json={
            "type": "FLIGHT",
            "title": "Backup Flight Should Not Count",
            "details": {"origin_iata": "TPE", "dest_iata": "NRT"},
        },
    )

    # Record an expense in JPY converted to TWD (home currency).
    exp_resp = await api_client.post(
        f"/api/v1/trips/{jp_trip['id']}/expenses",
        headers=dev_headers,
        json={
            "title": "Shinkansen Tickets",
            "category": "TRANSIT",
            "amount_original": "10000.00",
            "currency_original": "JPY",
            "exchange_rate": "0.215",
        },
    )
    assert exp_resp.status_code == 201
    assert exp_resp.json()["amount_home"] == "2150.00"

    exp_summary = (
        await api_client.get(
            f"/api/v1/trips/{jp_trip['id']}/expenses", headers=dev_headers
        )
    ).json()
    assert exp_summary["total_home_amount"] == "2150.00"
    assert exp_summary["by_category"]["TRANSIT"] == "2150.00"

    # Verify annual stats exclude Plan B backup flight and classify international trips.
    stats = (
        await api_client.get("/api/v1/stats?year=2026", headers=dev_headers)
    ).json()
    assert stats["total_trips"] == 2
    assert stats["domestic_trips"] == 1
    assert stats["international_trips"] == 1
    assert stats["countries_visited"] == ["JP", "TW"]
    assert stats["country_visit_counts"] == {"JP": 1, "TW": 1}
    assert stats["total_travel_days"] == 4
    assert stats["flight_count"] == 1
    assert stats["total_ground_distance_km"] == 12.4
    assert 2080.0 <= stats["total_flight_distance_km"] <= 2120.0
    assert stats["total_spend_home"] == "2150.00"
    assert stats["avg_spend_per_day"] == "537.50"
    assert len(stats["trips"]) == 2
    assert 2026 in stats["available_years"]

    # Verify scope filtering cleanly splits domestic vs international metrics.
    intl_stats = (
        await api_client.get(
            "/api/v1/stats?year=2026&scope=international", headers=dev_headers
        )
    ).json()
    assert intl_stats["total_trips"] == 1
    assert intl_stats["domestic_trips"] == 0
    assert intl_stats["international_trips"] == 1
    assert intl_stats["countries_visited"] == ["JP"]

    dom_stats = (
        await api_client.get(
            "/api/v1/stats?year=2026&scope=domestic", headers=dev_headers
        )
    ).json()
    assert dom_stats["total_trips"] == 1
    assert dom_stats["domestic_trips"] == 1
    assert dom_stats["international_trips"] == 0
    assert dom_stats["total_spend_home"] == "0.00"


@pytest.mark.asyncio
async def test_expense_rejects_cross_trip_day_or_item_links(
    api_client: AsyncClient, dev_headers: dict[str, str]
) -> None:
    trip_a = (
        await api_client.post(
            "/api/v1/trips",
            headers=dev_headers,
            json={
                "title": "Trip A",
                "country_codes": ["JP"],
                "start_date": "2026-10-01",
                "end_date": "2026-10-01",
            },
        )
    ).json()
    trip_b = (
        await api_client.post(
            "/api/v1/trips",
            headers=dev_headers,
            json={
                "title": "Trip B",
                "country_codes": ["TW"],
                "start_date": "2026-10-05",
                "end_date": "2026-10-05",
            },
        )
    ).json()

    trip_b_day_id = trip_b["days"][0]["id"]
    trip_b_opt_id = trip_b["days"][0]["active_option_id"]
    trip_b_item = (
        await api_client.post(
            f"/api/v1/options/{trip_b_opt_id}/items",
            headers=dev_headers,
            json={"type": "FOOD", "title": "Trip B Lunch"},
        )
    ).json()

    bad_day = await api_client.post(
        f"/api/v1/trips/{trip_a['id']}/expenses",
        headers=dev_headers,
        json={
            "title": "Cross-trip day",
            "category": "FOOD",
            "amount_original": "100.00",
            "currency_original": "JPY",
            "trip_day_id": trip_b_day_id,
        },
    )
    assert bad_day.status_code == 400

    bad_item = await api_client.post(
        f"/api/v1/trips/{trip_a['id']}/expenses",
        headers=dev_headers,
        json={
            "title": "Cross-trip item",
            "category": "FOOD",
            "amount_original": "100.00",
            "currency_original": "JPY",
            "itinerary_item_id": trip_b_item["id"],
        },
    )
    assert bad_item.status_code == 400


@pytest.mark.asyncio
async def test_flight_uses_user_home_country_and_expenses_normalize_home_currency(
    api_client: AsyncClient, dev_headers: dict[str, str]
) -> None:
    # Configure user as Japan-based with JPY home currency.
    patch_resp = await api_client.patch(
        "/api/v1/me",
        headers=dev_headers,
        json={"home_country_code": "JP", "home_currency": "TWD"},
    )
    assert patch_resp.status_code == 200

    trip = (
        await api_client.post(
            "/api/v1/trips",
            headers=dev_headers,
            json={
                "title": "Taipei Trip from Tokyo",
                "country_codes": ["TW"],
                "start_date": "2026-11-24",
                "end_date": "2026-11-24",
                "default_currency": "TWD",
            },
        )
    ).json()
    opt_id = trip["days"][0]["active_option_id"]

    # Flight HND -> TSA for a JP resident should pin TSA (~25.07N, ~121.55E).
    flight_resp = await api_client.post(
        f"/api/v1/options/{opt_id}/items",
        headers=dev_headers,
        json={
            "type": "FLIGHT",
            "title": "JL97 HND -> TSA",
            "details": {"origin_iata": "HND", "dest_iata": "TSA"},
        },
    )
    assert flight_resp.status_code == 201
    flight = flight_resp.json()
    assert 24.5 <= flight["latitude"] <= 25.5
    assert 121.0 <= flight["longitude"] <= 122.0

    # Log 1000 JPY while home_currency is TWD (rate 0.2 -> 200 TWD).
    await api_client.post(
        f"/api/v1/trips/{trip['id']}/expenses",
        headers=dev_headers,
        json={
            "title": "Airport Ramen",
            "category": "FOOD",
            "amount_original": "1000.00",
            "currency_original": "JPY",
            "exchange_rate": "0.2",
        },
    )

    # Switch home currency to JPY; summaries should normalize to 1000.00 JPY.
    await api_client.patch(
        "/api/v1/me",
        headers=dev_headers,
        json={"home_currency": "JPY"},
    )
    exp_summary = (
        await api_client.get(
            f"/api/v1/trips/{trip['id']}/expenses", headers=dev_headers
        )
    ).json()
    assert exp_summary["home_currency"] == "JPY"
    assert exp_summary["total_home_amount"] == "1000.00"

    stats = (
        await api_client.get("/api/v1/stats?year=2026", headers=dev_headers)
    ).json()
    assert stats["home_currency"] == "JPY"
    assert stats["total_spend_home"] == "1000.00"
