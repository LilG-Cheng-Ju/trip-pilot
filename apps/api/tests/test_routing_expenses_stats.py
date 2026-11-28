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
    assert len(stats["flight_routes"]) == 1
    route = stats["flight_routes"][0]
    assert route["origin_iata"] == "TSA"
    assert route["dest_iata"] == "HND"
    assert route["origin_country_code"] == "TW"
    assert route["dest_country_code"] == "JP"
    assert route["count"] == 1
    assert isinstance(route["origin_lat"], float)
    assert isinstance(route["dest_lng"], float)

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
    assert dom_stats["flight_routes"] == []


@pytest.mark.asyncio
async def test_stats_flight_routes_aggregate_round_trip_and_ignore_non_flown_countries(
    api_client: AsyncClient, dev_headers: dict[str, str]
) -> None:
    trip = (
        await api_client.post(
            "/api/v1/trips",
            headers=dev_headers,
            json={
                "title": "Czechia & Austria (Prague In/Out)",
                "country_codes": ["CZ", "AT"],
                "start_date": "2026-05-15",
                "end_date": "2026-05-16",
            },
        )
    ).json()
    opt_day1 = trip["days"][0]["active_option_id"]
    opt_day2 = trip["days"][1]["active_option_id"]

    await api_client.post(
        f"/api/v1/options/{opt_day1}/items",
        headers=dev_headers,
        json={
            "type": "FLIGHT",
            "title": "CI067 TPE -> PRG",
            "details": {"origin_iata": "TPE", "dest_iata": "PRG"},
        },
    )
    await api_client.post(
        f"/api/v1/options/{opt_day2}/items",
        headers=dev_headers,
        json={
            "type": "FLIGHT",
            "title": "CI068 PRG -> TPE",
            "details": {"origin_iata": "PRG", "dest_iata": "TPE"},
        },
    )

    stats = (
        await api_client.get("/api/v1/stats?year=2026", headers=dev_headers)
    ).json()
    assert stats["countries_visited"] == ["AT", "CZ"]
    assert len(stats["flight_routes"]) == 1
    route = stats["flight_routes"][0]
    assert route["origin_iata"] == "TPE"
    assert route["dest_iata"] == "PRG"
    assert route["count"] == 2


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


@pytest.mark.asyncio
async def test_airport_and_inherited_stay_ground_routing(
    api_client: AsyncClient, dev_headers: dict[str, str]
) -> None:
    trip = (
        await api_client.post(
            "/api/v1/trips",
            headers=dev_headers,
            json={
                "title": "Tokyo Transfers",
                "country_codes": ["JP"],
                "start_date": "2026-12-01",
                "end_date": "2026-12-03",
                "default_currency": "JPY",
            },
        )
    ).json()
    opt1_id = trip["days"][0]["active_option_id"]
    opt2_id = trip["days"][1]["active_option_id"]
    opt3_id = trip["days"][2]["active_option_id"]

    mock_leg = RouteLegResult(
        distance_km=15.0,
        duration_min=25,
        geometry_polyline="poly_leg",
        is_approx=False,
    )
    with patch(
        "app.services.routing.OsrmRoutingProvider.compute_leg",
        new=AsyncMock(return_value=mock_leg),
    ):
        flight_arr = (
            await api_client.post(
                f"/api/v1/options/{opt1_id}/items",
                headers=dev_headers,
                json={
                    "type": "FLIGHT",
                    "title": "TPE -> NRT",
                    "details": {"origin_iata": "TPE", "dest_iata": "NRT"},
                },
            )
        ).json()
        assert flight_arr["details"]["airport_role"] == "ARRIVAL"

        stay = (
            await api_client.post(
                f"/api/v1/options/{opt1_id}/items",
                headers=dev_headers,
                json={
                    "type": "STAY",
                    "title": "Shinjuku Basecamp",
                    "latitude": 35.6909,
                    "longitude": 139.7003,
                },
            )
        ).json()

        # Single-stop Day 2 should round-trip from/to the inherited Day 1 stay.
        spot2 = (
            await api_client.post(
                f"/api/v1/options/{opt2_id}/items",
                headers=dev_headers,
                json={
                    "type": "SPOT",
                    "title": "Mt. Fuji Viewpoint",
                    "latitude": 35.3606,
                    "longitude": 138.7274,
                },
            )
        ).json()

        # Day 3 connects inherited stay -> Ueno -> departure airport (no stay return).
        spot3 = (
            await api_client.post(
                f"/api/v1/options/{opt3_id}/items",
                headers=dev_headers,
                json={
                    "type": "SPOT",
                    "title": "Ueno Park",
                    "latitude": 35.7148,
                    "longitude": 139.7745,
                },
            )
        ).json()
        flight_dep = (
            await api_client.post(
                f"/api/v1/options/{opt3_id}/items",
                headers=dev_headers,
                json={
                    "type": "FLIGHT",
                    "title": "NRT -> TPE",
                    "details": {"origin_iata": "NRT", "dest_iata": "TPE"},
                },
            )
        ).json()
        assert flight_dep["details"]["airport_role"] == "DEPARTURE"

    detail = (
        await api_client.get(f"/api/v1/trips/{trip['id']}", headers=dev_headers)
    ).json()

    day1_pairs = [
        (s["from_item_id"], s["to_item_id"])
        for s in detail["days"][0]["options"][0]["route_segments"]
    ]
    assert day1_pairs == [(flight_arr["id"], stay["id"])]

    day2_pairs = [
        (s["from_item_id"], s["to_item_id"])
        for s in detail["days"][1]["options"][0]["route_segments"]
    ]
    assert day2_pairs == [(stay["id"], spot2["id"]), (spot2["id"], stay["id"])]

    day3_pairs = [
        (s["from_item_id"], s["to_item_id"])
        for s in detail["days"][2]["options"][0]["route_segments"]
    ]
    assert day3_pairs == [(stay["id"], spot3["id"]), (spot3["id"], flight_dep["id"])]


@pytest.mark.asyncio
async def test_patch_expense_updates_and_clears_trip_day_attribution(
    api_client: AsyncClient, dev_headers: dict[str, str]
) -> None:
    trip = (
        await api_client.post(
            "/api/v1/trips",
            headers=dev_headers,
            json={
                "title": "Expense Attribution Trip",
                "country_codes": ["JP"],
                "start_date": "2026-11-24",
                "end_date": "2026-11-25",
                "default_currency": "JPY",
            },
        )
    ).json()
    other_trip = (
        await api_client.post(
            "/api/v1/trips",
            headers=dev_headers,
            json={
                "title": "Other Trip",
                "country_codes": ["TW"],
                "start_date": "2026-12-01",
                "end_date": "2026-12-01",
            },
        )
    ).json()
    day1_id = trip["days"][0]["id"]
    day2_id = trip["days"][1]["id"]
    other_day_id = other_trip["days"][0]["id"]

    exp = (
        await api_client.post(
            f"/api/v1/trips/{trip['id']}/expenses",
            headers=dev_headers,
            json={
                "title": "ICOCA Card",
                "category": "TRANSIT",
                "amount_original": "2000.00",
                "currency_original": "JPY",
                "exchange_rate": "0.21",
            },
        )
    ).json()
    assert exp["trip_day_id"] is None

    # Assign to Day 1.
    set_day1 = await api_client.patch(
        f"/api/v1/expenses/{exp['id']}",
        headers=dev_headers,
        json={"trip_day_id": day1_id},
    )
    assert set_day1.status_code == 200
    assert set_day1.json()["trip_day_id"] == day1_id

    # Move to Day 2.
    set_day2 = await api_client.patch(
        f"/api/v1/expenses/{exp['id']}",
        headers=dev_headers,
        json={"trip_day_id": day2_id},
    )
    assert set_day2.status_code == 200
    assert set_day2.json()["trip_day_id"] == day2_id

    # Unrelated patch preserves existing trip_day_id.
    keep_day = await api_client.patch(
        f"/api/v1/expenses/{exp['id']}",
        headers=dev_headers,
        json={"title": "ICOCA Top-up"},
    )
    assert keep_day.status_code == 200
    assert keep_day.json()["title"] == "ICOCA Top-up"
    assert keep_day.json()["trip_day_id"] == day2_id

    # Reject cross-trip day link.
    bad_link = await api_client.patch(
        f"/api/v1/expenses/{exp['id']}",
        headers=dev_headers,
        json={"trip_day_id": other_day_id},
    )
    assert bad_link.status_code == 400

    # Clear trip_day_id explicitly with null.
    cleared = await api_client.patch(
        f"/api/v1/expenses/{exp['id']}",
        headers=dev_headers,
        json={"trip_day_id": None},
    )
    assert cleared.status_code == 200
    assert cleared.json()["trip_day_id"] is None


@pytest.mark.asyncio
async def test_stay_update_and_delete_recalculates_downstream_days_and_unlinks_expenses(
    api_client: AsyncClient, dev_headers: dict[str, str]
) -> None:
    trip = (
        await api_client.post(
            "/api/v1/trips",
            headers=dev_headers,
            json={
                "title": "Stay Cascade & FK Trip",
                "country_codes": ["JP"],
                "start_date": "2026-12-01",
                "end_date": "2026-12-02",
                "default_currency": "JPY",
            },
        )
    ).json()
    opt1_id = trip["days"][0]["active_option_id"]
    day2_id = trip["days"][1]["id"]
    opt2_id = trip["days"][1]["active_option_id"]

    leg_15 = RouteLegResult(
        distance_km=15.0,
        duration_min=25,
        geometry_polyline="poly_15",
        is_approx=False,
    )
    with patch(
        "app.services.routing.OsrmRoutingProvider.compute_leg",
        new=AsyncMock(return_value=leg_15),
    ):
        stay = (
            await api_client.post(
                f"/api/v1/options/{opt1_id}/items",
                headers=dev_headers,
                json={
                    "type": "STAY",
                    "title": "Hotel A",
                    "latitude": 35.6909,
                    "longitude": 139.7003,
                },
            )
        ).json()
        spot2 = (
            await api_client.post(
                f"/api/v1/options/{opt2_id}/items",
                headers=dev_headers,
                json={
                    "type": "SPOT",
                    "title": "Day 2 Spot",
                    "latitude": 35.7148,
                    "longitude": 139.7745,
                },
            )
        ).json()

    # Link an expense to Day 2's spot so we can verify FK cleanup on delete_item.
    linked_exp = (
        await api_client.post(
            f"/api/v1/trips/{trip['id']}/expenses",
            headers=dev_headers,
            json={
                "title": "Spot Entry Ticket",
                "category": "ACTIVITY",
                "amount_original": "1500.00",
                "currency_original": "JPY",
                "exchange_rate": "0.21",
                "trip_day_id": day2_id,
                "itinerary_item_id": spot2["id"],
            },
        )
    ).json()

    initial_day2 = (
        await api_client.get(f"/api/v1/trips/{trip['id']}", headers=dev_headers)
    ).json()["days"][1]["options"][0]
    assert initial_day2["cached_ground_distance_km"] == 30.0
    assert len(initial_day2["route_segments"]) == 2

    # Updating Day 1 STAY coordinates must cascade and recalculate Day 2's routes.
    leg_22 = RouteLegResult(
        distance_km=22.5,
        duration_min=35,
        geometry_polyline="poly_22",
        is_approx=False,
    )
    with patch(
        "app.services.routing.OsrmRoutingProvider.compute_leg",
        new=AsyncMock(return_value=leg_22),
    ):
        upd_stay = await api_client.patch(
            f"/api/v1/items/{stay['id']}",
            headers=dev_headers,
            json={"latitude": 35.6585, "longitude": 139.7454},
        )
        assert upd_stay.status_code == 200

    after_stay_move = (
        await api_client.get(f"/api/v1/trips/{trip['id']}", headers=dev_headers)
    ).json()["days"][1]["options"][0]
    assert after_stay_move["cached_ground_distance_km"] == 45.0

    # Deleting Day 1 STAY clears Day 2's inherited segments and resets distance to 0.
    del_stay = await api_client.delete(
        f"/api/v1/items/{stay['id']}", headers=dev_headers
    )
    assert del_stay.status_code == 204
    after_stay_del = (
        await api_client.get(f"/api/v1/trips/{trip['id']}", headers=dev_headers)
    ).json()["days"][1]["options"][0]
    assert after_stay_del["route_segments"] == []
    assert after_stay_del["cached_ground_distance_km"] == 0.0

    # Deleting Day 2 spot preserves the expense while clearing itinerary_item_id.
    del_spot = await api_client.delete(
        f"/api/v1/items/{spot2['id']}", headers=dev_headers
    )
    assert del_spot.status_code == 204
    expenses = (
        await api_client.get(
            f"/api/v1/trips/{trip['id']}/expenses", headers=dev_headers
        )
    ).json()["items"]
    assert len(expenses) == 1
    assert expenses[0]["id"] == linked_exp["id"]
    assert expenses[0]["itinerary_item_id"] is None
    assert expenses[0]["trip_day_id"] == day2_id

    # Deleting the entire populated trip must succeed under PRAGMA foreign_keys=ON.
    del_trip = await api_client.delete(
        f"/api/v1/trips/{trip['id']}", headers=dev_headers
    )
    assert del_trip.status_code == 204


@pytest.mark.asyncio
async def test_osrm_routing_runs_outside_active_db_transaction() -> None:
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.core.database import Base, configure_sqlite_foreign_keys
    from app.models import RouteProfile, User
    from app.schemas.trip import ItineraryItemCreate, TripCreate
    from app.services.trip_service import TripService

    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    configure_sqlite_foreign_keys(engine)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        user = User(firebase_uid="tx-check-user", email="tx@example.test")
        session.add(user)
        await session.commit()

        observed_in_tx: list[bool] = []

        class _TxCheckingRouter:
            async def compute_leg(
                self,
                lat1: float,
                lng1: float,
                lat2: float,
                lng2: float,
                profile: RouteProfile = RouteProfile.DRIVING,
            ) -> RouteLegResult:
                del lat1, lng1, lat2, lng2, profile
                observed_in_tx.append(session.in_transaction())
                return RouteLegResult(
                    distance_km=4.2,
                    duration_min=10,
                    geometry_polyline="poly",
                    is_approx=False,
                )

        svc = TripService(session, routing_provider=_TxCheckingRouter())
        trip = await svc.create_trip(
            user.id,
            TripCreate(
                title="No TX Lock Trip",
                country_codes=["JP"],
                start_date="2027-01-01",
                end_date="2027-01-01",
            ),
        )
        opt_id = trip.days[0].active_option_id
        assert opt_id is not None

        await svc.add_item(
            opt_id,
            user.id,
            ItineraryItemCreate(
                title="Spot 1",
                latitude=35.6812,
                longitude=139.7671,
            ),
        )
        await svc.add_item(
            opt_id,
            user.id,
            ItineraryItemCreate(
                title="Spot 2",
                latitude=35.7148,
                longitude=139.7745,
            ),
        )

        assert observed_in_tx == [False]

    await engine.dispose()
