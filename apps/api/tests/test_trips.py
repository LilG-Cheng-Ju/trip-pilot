"""Integration tests for Trips, DayOptions (Plan A/B), Items, and Share privacy."""

from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

from app.schemas.trip import TripUpdate
from app.services.routing import RouteLegResult
from app.services.trip_service import TripService


@pytest.mark.asyncio
async def test_trip_days_plan_a_b_and_items_lifecycle(
    api_client: AsyncClient, dev_headers: dict[str, str]
) -> None:
    create_resp = await api_client.post(
        "/api/v1/trips",
        headers=dev_headers,
        json={
            "title": "Tokyo & Izu",
            "destination_summary": "Tokyo, Atami",
            "country_codes": ["jp"],
            "start_date": "2026-11-24",
            "end_date": "2026-11-25",
            "default_currency": "jpy",
        },
    )
    assert create_resp.status_code == 201
    trip = create_resp.json()
    assert trip["country_codes"] == ["JP"]
    assert len(trip["days"]) == 2

    day1 = trip["days"][0]
    assert len(day1["options"]) == 1
    plan_a_id = day1["options"][0]["id"]
    assert day1["active_option_id"] == plan_a_id

    # Add a STAY item with a sensitive confirmation_code and private note.
    stay_resp = await api_client.post(
        f"/api/v1/options/{plan_a_id}/items",
        headers=dev_headers,
        json={
            "type": "STAY",
            "title": "Kai Atami Ryokan",
            "start_time": "15:00",
            "notes": "Ask for ocean view",
            "details": {
                "confirmation_code": "SECRET-9921",
                "check_in_time": "15:00",
            },
        },
    )
    assert stay_resp.status_code == 201
    stay_id = stay_resp.json()["id"]

    # Add a LOCAL_TRANSIT connector and reorder them.
    transit_resp = await api_client.post(
        f"/api/v1/options/{plan_a_id}/items",
        headers=dev_headers,
        json={
            "type": "LOCAL_TRANSIT",
            "title": "Walk to Ryokan",
            "details": {"mode": "WALK", "duration_minutes": 8},
        },
    )
    assert transit_resp.status_code == 201
    transit_id = transit_resp.json()["id"]

    reorder_resp = await api_client.post(
        f"/api/v1/options/{plan_a_id}/items/reorder",
        headers=dev_headers,
        json={"item_ids": [transit_id, stay_id]},
    )
    assert reorder_resp.status_code == 200
    reordered_ids = [item["id"] for item in reorder_resp.json()["items"]]
    assert reordered_ids == [transit_id, stay_id]

    # Clone Plan A into Plan B · Rainy with geolocated spots preserves route_segments.
    mock_leg = RouteLegResult(
        distance_km=3.2,
        duration_min=9,
        geometry_polyline="_p~iF~ps|U_ulLnnqC_mqNvxq`@",
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
                "title": "Atami Castle",
                "latitude": 35.087,
                "longitude": 139.077,
            },
        )
        await api_client.post(
            f"/api/v1/options/{plan_a_id}/items",
            headers=dev_headers,
            json={
                "type": "FOOD",
                "title": "Seafood Don",
                "latitude": 35.095,
                "longitude": 139.072,
            },
        )

    clone_resp = await api_client.post(
        f"/api/v1/options/{plan_a_id}/clone",
        headers=dev_headers,
        json={"label": "Plan B · Rainy"},
    )
    assert clone_resp.status_code == 201
    plan_b_id = clone_resp.json()["id"]
    assert len(clone_resp.json()["items"]) == 4
    assert len(clone_resp.json()["route_segments"]) == 1
    assert (
        clone_resp.json()["route_segments"][0]["geometry_polyline"]
        == "_p~iF~ps|U_ulLnnqC_mqNvxq`@"
    )

    switch_resp = await api_client.patch(
        f"/api/v1/days/{day1['id']}/active-option",
        headers=dev_headers,
        json={"day_option_id": plan_b_id},
    )
    assert switch_resp.status_code == 200
    assert switch_resp.json()["active_option_id"] == plan_b_id

    # Public share omits heavy OSRM polylines (editorial curves render client-side).
    share_resp = await api_client.post(
        f"/api/v1/trips/{trip['id']}/shares",
        headers=dev_headers,
        json={"label": "Public Route"},
    )
    assert share_resp.status_code == 201
    pub_trip = (
        await api_client.get(f"/api/v1/public/trips/{share_resp.json()['token']}")
    ).json()
    pub_segments = pub_trip["days"][0]["options"][0]["route_segments"]
    assert pub_segments == []


@pytest.mark.asyncio
async def test_public_share_enforces_visibility_policy(
    api_client: AsyncClient, dev_headers: dict[str, str]
) -> None:
    trip_resp = await api_client.post(
        "/api/v1/trips",
        headers=dev_headers,
        json={
            "title": "Kyoto Escape",
            "country_codes": ["JP"],
            "start_date": "2026-12-01",
            "end_date": "2026-12-01",
        },
    )
    trip = trip_resp.json()
    day1 = trip["days"][0]
    plan_a_id = day1["active_option_id"]

    flight_resp = await api_client.post(
        f"/api/v1/options/{plan_a_id}/items",
        headers=dev_headers,
        json={
            "type": "FLIGHT",
            "title": "BR132 TPE -> KIX",
            "notes": "Private passport reminder",
            "details": {
                "origin_iata": "TPE",
                "dest_iata": "KIX",
                "booking_ref": "PNR-XYZ123",
            },
        },
    )
    flight_id = flight_resp.json()["id"]
    await api_client.post(
        f"/api/v1/options/{plan_a_id}/items",
        headers=dev_headers,
        json={
            "type": "FLIGHT",
            "title": "JL814 Backup Flight",
            "alternative_for_item_id": flight_id,
        },
    )
    await api_client.post(
        f"/api/v1/days/{day1['id']}/options",
        headers=dev_headers,
        json={"label": "Plan B · Rainy"},
    )

    # Default share hides booking_ref, notes, and backup options/choices.
    share_resp = await api_client.post(
        f"/api/v1/trips/{trip['id']}/shares",
        headers=dev_headers,
        json={"label": "Public Link"},
    )
    assert share_resp.status_code == 201
    share_token = share_resp.json()["token"]

    pub_resp = await api_client.get(f"/api/v1/public/trips/{share_token}")
    assert pub_resp.status_code == 200
    pub_trip = pub_resp.json()
    assert len(pub_trip["days"][0]["options"]) == 1
    assert len(pub_trip["days"][0]["options"][0]["items"]) == 1
    pub_item = pub_trip["days"][0]["options"][0]["items"][0]
    assert pub_item["notes"] is None
    assert "booking_ref" not in pub_item["details"]
    assert pub_item["details"]["origin_iata"] == "TPE"

    # Companion share explicitly exposes booking_ref and backup options/choices.
    companion_resp = await api_client.post(
        f"/api/v1/trips/{trip['id']}/shares",
        headers=dev_headers,
        json={
            "label": "Travel Companion",
            "visibility_policy": {
                "include_booking_refs": True,
                "include_notes": True,
                "include_backup_options": True,
            },
        },
    )
    companion_token = companion_resp.json()["token"]
    comp_pub = (
        await api_client.get(f"/api/v1/public/trips/{companion_token}")
    ).json()
    assert len(comp_pub["days"][0]["options"]) == 2
    assert len(comp_pub["days"][0]["options"][0]["items"]) == 2
    comp_item = comp_pub["days"][0]["options"][0]["items"][0]
    assert comp_item["details"]["booking_ref"] == "PNR-XYZ123"
    assert comp_item["notes"] == "Private passport reminder"


@pytest.mark.asyncio
async def test_day_option_rename_and_delete_guard(
    api_client: AsyncClient, dev_headers: dict[str, str]
) -> None:
    trip_resp = await api_client.post(
        "/api/v1/trips",
        headers=dev_headers,
        json={
            "title": "Plan Options Guard Test",
            "country_codes": ["JP"],
            "start_date": "2027-04-01",
            "end_date": "2027-04-01",
            "default_currency": "JPY",
        },
    )
    assert trip_resp.status_code == 201
    day = trip_resp.json()["days"][0]
    plan_a_id = day["options"][0]["id"]

    # Deleting the only remaining option must be rejected.
    blocked = await api_client.delete(
        f"/api/v1/options/{plan_a_id}", headers=dev_headers
    )
    assert blocked.status_code == 400

    # Rename Plan A.
    renamed = await api_client.patch(
        f"/api/v1/options/{plan_a_id}",
        headers=dev_headers,
        json={"label": "Sunny Outdoor"},
    )
    assert renamed.status_code == 200
    assert renamed.json()["label"] == "Sunny Outdoor"

    # Add a blank Plan B.
    plan_b_resp = await api_client.post(
        f"/api/v1/days/{day['id']}/options",
        headers=dev_headers,
        json={"label": "Rainy Indoor"},
    )
    assert plan_b_resp.status_code == 201
    plan_b_id = plan_b_resp.json()["id"]
    assert plan_b_resp.json()["items"] == []

    # Deleting the active option (Plan A) succeeds and promotes Plan B as active.
    deleted = await api_client.delete(
        f"/api/v1/options/{plan_a_id}", headers=dev_headers
    )
    assert deleted.status_code == 200
    updated_day = deleted.json()
    assert len(updated_day["options"]) == 1
    assert updated_day["options"][0]["id"] == plan_b_id
    assert updated_day["active_option_id"] == plan_b_id


@pytest.mark.asyncio
async def test_item_rejects_non_http_urls_in_maps_and_attachments(
    api_client: AsyncClient, dev_headers: dict[str, str]
) -> None:
    trip = (
        await api_client.post(
            "/api/v1/trips",
            headers=dev_headers,
            json={
                "title": "URL Validation Trip",
                "country_codes": ["JP"],
                "start_date": "2027-05-01",
                "end_date": "2027-05-01",
            },
        )
    ).json()
    plan_a_id = trip["days"][0]["active_option_id"]

    bad_maps = await api_client.post(
        f"/api/v1/options/{plan_a_id}/items",
        headers=dev_headers,
        json={
            "type": "SPOT",
            "title": "XSS Spot",
            "google_maps_url": "javascript:alert(1)",
        },
    )
    assert bad_maps.status_code == 422

    bad_att = await api_client.post(
        f"/api/v1/options/{plan_a_id}/items",
        headers=dev_headers,
        json={
            "type": "SPOT",
            "title": "XSS Attachment",
            "details": {
                "attachments": [{"name": "evil", "url": "javascript:alert(1)"}]
            },
        },
    )
    assert bad_att.status_code == 422


@pytest.mark.asyncio
async def test_patch_trip_start_date_shifts_days_and_end_date(
    api_client: AsyncClient, dev_headers: dict[str, str]
) -> None:
    created = (
        await api_client.post(
            "/api/v1/trips",
            headers=dev_headers,
            json={
                "title": "Hokkaido Roadtrip",
                "country_codes": ["JP"],
                "start_date": "2026-11-24",
                "end_date": "2026-11-26",
            },
        )
    ).json()
    trip_id = created["id"]
    assert [d["date"] for d in created["days"]] == [
        "2026-11-24",
        "2026-11-25",
        "2026-11-26",
    ]

    # Shift forward by 7 days.
    shifted_fwd = await api_client.patch(
        f"/api/v1/trips/{trip_id}",
        headers=dev_headers,
        json={"start_date": "2026-12-01"},
    )
    assert shifted_fwd.status_code == 200
    fwd_trip = shifted_fwd.json()
    assert fwd_trip["start_date"] == "2026-12-01"
    assert fwd_trip["end_date"] == "2026-12-03"
    assert [(d["day_index"], d["date"]) for d in fwd_trip["days"]] == [
        (1, "2026-12-01"),
        (2, "2026-12-02"),
        (3, "2026-12-03"),
    ]

    # Shift backward together with metadata update.
    shifted_back = await api_client.patch(
        f"/api/v1/trips/{trip_id}",
        headers=dev_headers,
        json={"title": "Hokkaido Winter", "start_date": "2026-11-10"},
    )
    assert shifted_back.status_code == 200
    back_trip = shifted_back.json()
    assert back_trip["title"] == "Hokkaido Winter"
    assert back_trip["start_date"] == "2026-11-10"
    assert back_trip["end_date"] == "2026-11-12"
    assert [(d["day_index"], d["date"]) for d in back_trip["days"]] == [
        (1, "2026-11-10"),
        (2, "2026-11-11"),
        (3, "2026-11-12"),
    ]


@pytest.mark.asyncio
async def test_update_trip_start_date_preserves_none_end_date() -> None:
    fake_db = SimpleNamespace(commit=AsyncMock())
    svc = TripService(fake_db)  # type: ignore[arg-type]
    open_ended_trip = SimpleNamespace(
        id="trip-open",
        start_date=date(2026, 11, 1),
        end_date=None,
        days=[
            SimpleNamespace(day_index=1, date=date(2026, 11, 1)),
            SimpleNamespace(day_index=2, date=date(2026, 11, 2)),
        ],
    )
    svc.get_trip_detail = AsyncMock(return_value=open_ended_trip)  # type: ignore[method-assign]

    updated = await svc.update_trip(
        "trip-open",
        "user-1",
        TripUpdate(start_date=date(2026, 11, 5)),
    )
    assert updated.start_date == date(2026, 11, 5)
    assert updated.end_date is None
    assert [d.date for d in updated.days] == [date(2026, 11, 5), date(2026, 11, 6)]


@pytest.mark.asyncio
async def test_delete_day_reindexes_shifts_dates_and_unlinks_expenses(
    api_client: AsyncClient, dev_headers: dict[str, str]
) -> None:
    created = (
        await api_client.post(
            "/api/v1/trips",
            headers=dev_headers,
            json={
                "title": "Kyushu Three Days",
                "country_codes": ["JP"],
                "start_date": "2026-12-10",
                "end_date": "2026-12-12",
                "default_currency": "JPY",
            },
        )
    ).json()
    trip_id = created["id"]
    day1_id, day2_id, day3_id = (d["id"] for d in created["days"])
    day1_opt = created["days"][0]["active_option_id"]
    day2_opt = created["days"][1]["active_option_id"]

    mock_leg = RouteLegResult(
        distance_km=5.0,
        duration_min=10,
        geometry_polyline="poly",
        is_approx=False,
    )
    with patch(
        "app.services.routing.OsrmRoutingProvider.compute_leg",
        new=AsyncMock(return_value=mock_leg),
    ):
        await api_client.post(
            f"/api/v1/options/{day1_opt}/items",
            headers=dev_headers,
            json={
                "type": "STAY",
                "title": "Hakata Hotel",
                "latitude": 33.5902,
                "longitude": 130.4207,
            },
        )
        day2_item = (
            await api_client.post(
                f"/api/v1/options/{day2_opt}/items",
                headers=dev_headers,
                json={
                    "type": "FOOD",
                    "title": "Ramen Stadium",
                    "latitude": 33.5898,
                    "longitude": 130.4108,
                },
            )
        ).json()

    exp_day2 = (
        await api_client.post(
            f"/api/v1/trips/{trip_id}/expenses",
            headers=dev_headers,
            json={
                "title": "Tonkotsu Ramen",
                "category": "FOOD",
                "amount_original": "1200.00",
                "currency_original": "JPY",
                "exchange_rate": "0.21",
                "trip_day_id": day2_id,
                "itinerary_item_id": day2_item["id"],
            },
        )
    ).json()
    exp_day3 = (
        await api_client.post(
            f"/api/v1/trips/{trip_id}/expenses",
            headers=dev_headers,
            json={
                "title": "Dazaifu Train",
                "category": "TRANSIT",
                "amount_original": "820.00",
                "currency_original": "JPY",
                "exchange_rate": "0.21",
                "trip_day_id": day3_id,
            },
        )
    ).json()

    # Delete middle day (Day 2).
    del_mid = await api_client.delete(
        f"/api/v1/days/{day2_id}", headers=dev_headers
    )
    assert del_mid.status_code == 204

    after_mid = (
        await api_client.get(f"/api/v1/trips/{trip_id}", headers=dev_headers)
    ).json()
    assert after_mid["end_date"] == "2026-12-11"
    assert [(d["id"], d["day_index"], d["date"]) for d in after_mid["days"]] == [
        (day1_id, 1, "2026-12-10"),
        (day3_id, 2, "2026-12-11"),
    ]

    # Expense from Day 2 is preserved with day & item cleared; Day 3 stays linked.
    expenses = (
        await api_client.get(
            f"/api/v1/trips/{trip_id}/expenses", headers=dev_headers
        )
    ).json()["items"]
    by_id = {e["id"]: e for e in expenses}
    assert set(by_id.keys()) == {exp_day2["id"], exp_day3["id"]}
    assert by_id[exp_day2["id"]]["trip_day_id"] is None
    assert by_id[exp_day2["id"]]["itinerary_item_id"] is None
    assert by_id[exp_day3["id"]]["trip_day_id"] == day3_id

    # Delete Day 1 (holding a STAY) and confirm remaining day shifts to Day 1.
    del_first = await api_client.delete(
        f"/api/v1/days/{day1_id}", headers=dev_headers
    )
    assert del_first.status_code == 204

    after_first = (
        await api_client.get(f"/api/v1/trips/{trip_id}", headers=dev_headers)
    ).json()
    assert after_first["end_date"] == "2026-12-10"
    assert [(d["id"], d["day_index"], d["date"]) for d in after_first["days"]] == [
        (day3_id, 1, "2026-12-10"),
    ]

    # Deleting the sole remaining day must return 400.
    blocked = await api_client.delete(
        f"/api/v1/days/{day3_id}", headers=dev_headers
    )
    assert blocked.status_code == 400
    assert "last remaining day" in blocked.json()["detail"].lower()

    # Appending a new day after deletion continues sequentially without conflicts.
    appended = await api_client.post(
        f"/api/v1/trips/{trip_id}/days", headers=dev_headers
    )
    assert appended.status_code == 201
    assert appended.json()["day_index"] == 2
    assert appended.json()["date"] == "2026-12-11"

    # Deleting a non-existent day returns 404.
    missing = await api_client.delete(
        "/api/v1/days/non-existent-day", headers=dev_headers
    )
    assert missing.status_code == 404


@pytest.mark.asyncio
async def test_add_item_chronological_start_time_insertion(
    api_client: AsyncClient, dev_headers: dict[str, str]
) -> None:
    trip = (
        await api_client.post(
            "/api/v1/trips",
            headers=dev_headers,
            json={
                "title": "Chronological Sort Trip",
                "country_codes": ["JP"],
                "start_date": "2027-01-10",
                "end_date": "2027-01-14",
            },
        )
    ).json()
    opt_earliest = trip["days"][0]["active_option_id"]
    opt_middle = trip["days"][1]["active_option_id"]
    opt_before_untimed = trip["days"][2]["active_option_id"]
    opt_equal = trip["days"][3]["active_option_id"]
    opt_all_untimed = trip["days"][4]["active_option_id"]

    async def _post_item(
        option_id: str, title: str, start_time: str | None = None
    ) -> dict[str, object]:
        payload: dict[str, object] = {"type": "SPOT", "title": title}
        if start_time is not None:
            payload["start_time"] = start_time
        resp = await api_client.post(
            f"/api/v1/options/{option_id}/items",
            headers=dev_headers,
            json=payload,
        )
        assert resp.status_code == 201
        return dict(resp.json())

    # Case 1: Insert 08:30 before [10:00, 14:00].
    await _post_item(opt_earliest, "Morning 10:00", "10:00")
    await _post_item(opt_earliest, "Afternoon 14:00", "14:00")
    early = await _post_item(opt_earliest, "Early 08:30", "08:30")
    assert early["sort_order"] == 0

    # Case 2: Insert 11:30 between [10:00, 14:00, untimed_end].
    await _post_item(opt_middle, "Morning 10:00", "10:00")
    await _post_item(opt_middle, "Afternoon 14:00", "14:00")
    await _post_item(opt_middle, "Untimed End", None)
    mid = await _post_item(opt_middle, "Mid 11:30", "11:30")
    assert mid["sort_order"] == 1

    # Case 3: Insert 18:00 after 14:00 and before untimed_end.
    await _post_item(opt_before_untimed, "Morning 10:00", "10:00")
    await _post_item(opt_before_untimed, "Afternoon 14:00", "14:00")
    await _post_item(opt_before_untimed, "Untimed End", None)
    evening = await _post_item(opt_before_untimed, "Evening 18:00", "18:00")
    assert evening["sort_order"] == 2

    # Case 4: Equal start_time preserves arrival order after existing equal-time items.
    await _post_item(opt_equal, "Ten A", "10:00")
    await _post_item(opt_equal, "Fourteen", "14:00")
    ten_b = await _post_item(opt_equal, "Ten B", "10:00")
    ten_c = await _post_item(opt_equal, "Ten C", "10:00")
    assert ten_b["sort_order"] == 1
    assert ten_c["sort_order"] == 2

    # Case 5: All untimed items append new timed item, then H:MM normalizes cleanly.
    await _post_item(opt_all_untimed, "Untimed A", None)
    await _post_item(opt_all_untimed, "Untimed B", "")
    nine = await _post_item(opt_all_untimed, "Nine", "09:00")
    assert nine["sort_order"] == 2
    eight_thirty = await _post_item(opt_all_untimed, "Eight Thirty", "8:30")
    assert eight_thirty["sort_order"] == 2

    refreshed = (
        await api_client.get(f"/api/v1/trips/{trip['id']}", headers=dev_headers)
    ).json()
    days = refreshed["days"]

    assert [
        (i["title"], i["sort_order"]) for i in days[0]["options"][0]["items"]
    ] == [
        ("Early 08:30", 0),
        ("Morning 10:00", 1),
        ("Afternoon 14:00", 2),
    ]
    assert [
        (i["title"], i["sort_order"]) for i in days[1]["options"][0]["items"]
    ] == [
        ("Morning 10:00", 0),
        ("Mid 11:30", 1),
        ("Afternoon 14:00", 2),
        ("Untimed End", 3),
    ]
    assert [
        (i["title"], i["sort_order"]) for i in days[2]["options"][0]["items"]
    ] == [
        ("Morning 10:00", 0),
        ("Afternoon 14:00", 1),
        ("Evening 18:00", 2),
        ("Untimed End", 3),
    ]
    assert [
        (i["title"], i["sort_order"]) for i in days[3]["options"][0]["items"]
    ] == [
        ("Ten A", 0),
        ("Ten B", 1),
        ("Ten C", 2),
        ("Fourteen", 3),
    ]
    assert [
        (i["title"], i["sort_order"]) for i in days[4]["options"][0]["items"]
    ] == [
        ("Untimed A", 0),
        ("Untimed B", 1),
        ("Eight Thirty", 2),
        ("Nine", 3),
    ]


@pytest.mark.asyncio
async def test_add_item_explicit_sort_order_and_alternatives_preserve_order(
    api_client: AsyncClient, dev_headers: dict[str, str]
) -> None:
    trip = (
        await api_client.post(
            "/api/v1/trips",
            headers=dev_headers,
            json={
                "title": "Override & Alternative Order Trip",
                "country_codes": ["JP"],
                "start_date": "2027-02-01",
                "end_date": "2027-02-01",
            },
        )
    ).json()
    opt_id = trip["days"][0]["active_option_id"]

    item_10 = (
        await api_client.post(
            f"/api/v1/options/{opt_id}/items",
            headers=dev_headers,
            json={"type": "SPOT", "title": "Ten Spot", "start_time": "10:00"},
        )
    ).json()
    item_14 = (
        await api_client.post(
            f"/api/v1/options/{opt_id}/items",
            headers=dev_headers,
            json={"type": "SPOT", "title": "Fourteen Spot", "start_time": "14:00"},
        )
    ).json()

    # Explicit sort_order overrides chronological auto-sort.
    item_explicit = (
        await api_client.post(
            f"/api/v1/options/{opt_id}/items",
            headers=dev_headers,
            json={
                "type": "SPOT",
                "title": "Explicit End 08:30",
                "start_time": "08:30",
                "sort_order": 2,
            },
        )
    ).json()
    assert item_explicit["sort_order"] == 2

    # Adding a slot alternative must not alter existing primary item order.
    alt = (
        await api_client.post(
            f"/api/v1/options/{opt_id}/items",
            headers=dev_headers,
            json={
                "type": "SPOT",
                "title": "Ten Alt 07:00",
                "start_time": "07:00",
                "alternative_for_item_id": item_10["id"],
            },
        )
    ).json()
    assert alt["sort_order"] == item_10["sort_order"]
    assert alt["is_selected"] is False

    before_insert = (
        await api_client.get(f"/api/v1/trips/{trip['id']}", headers=dev_headers)
    ).json()["days"][0]["options"][0]["items"]
    primary_before = [i for i in before_insert if i["is_selected"]]
    assert [(i["id"], i["sort_order"]) for i in primary_before] == [
        (item_10["id"], 0),
        (item_14["id"], 1),
        (item_explicit["id"], 2),
    ]

    # Inserting 09:00 shifts the entire 10:00 choice group together to sort_order=1.
    item_09 = (
        await api_client.post(
            f"/api/v1/options/{opt_id}/items",
            headers=dev_headers,
            json={"type": "SPOT", "title": "Nine Spot", "start_time": "09:00"},
        )
    ).json()
    assert item_09["sort_order"] == 0

    after_insert = (
        await api_client.get(f"/api/v1/trips/{trip['id']}", headers=dev_headers)
    ).json()["days"][0]["options"][0]["items"]
    sort_by_title = {i["title"]: i["sort_order"] for i in after_insert}
    assert sort_by_title == {
        "Nine Spot": 0,
        "Ten Spot": 1,
        "Ten Alt 07:00": 1,
        "Fourteen Spot": 2,
        "Explicit End 08:30": 3,
    }


@pytest.mark.asyncio
async def test_add_item_middle_insertion_recalculates_routes(
    api_client: AsyncClient, dev_headers: dict[str, str]
) -> None:
    trip = (
        await api_client.post(
            "/api/v1/trips",
            headers=dev_headers,
            json={
                "title": "Chronological Route Recalc Trip",
                "country_codes": ["JP"],
                "start_date": "2027-03-01",
                "end_date": "2027-03-01",
            },
        )
    ).json()
    opt_id = trip["days"][0]["active_option_id"]

    mock_leg = RouteLegResult(
        distance_km=4.5,
        duration_min=12,
        geometry_polyline="poly",
        is_approx=False,
    )
    with patch(
        "app.services.routing.OsrmRoutingProvider.compute_leg",
        new=AsyncMock(return_value=mock_leg),
    ):
        spot_a = (
            await api_client.post(
                f"/api/v1/options/{opt_id}/items",
                headers=dev_headers,
                json={
                    "type": "SPOT",
                    "title": "Tokyo Tower",
                    "start_time": "10:00",
                    "latitude": 35.65858,
                    "longitude": 139.74543,
                },
            )
        ).json()
        spot_c = (
            await api_client.post(
                f"/api/v1/options/{opt_id}/items",
                headers=dev_headers,
                json={
                    "type": "SPOT",
                    "title": "Senso-ji",
                    "start_time": "16:00",
                    "latitude": 35.71476,
                    "longitude": 139.79665,
                },
            )
        ).json()

        before = (
            await api_client.get(f"/api/v1/trips/{trip['id']}", headers=dev_headers)
        ).json()["days"][0]["options"][0]
        assert [
            (seg["from_item_id"], seg["to_item_id"]) for seg in before["route_segments"]
        ] == [(spot_a["id"], spot_c["id"])]

        spot_b = (
            await api_client.post(
                f"/api/v1/options/{opt_id}/items",
                headers=dev_headers,
                json={
                    "type": "SPOT",
                    "title": "Tokyo Station",
                    "start_time": "12:00",
                    "latitude": 35.68123,
                    "longitude": 139.76712,
                },
            )
        ).json()

    after = (
        await api_client.get(f"/api/v1/trips/{trip['id']}", headers=dev_headers)
    ).json()["days"][0]["options"][0]
    assert [(i["id"], i["sort_order"]) for i in after["items"]] == [
        (spot_a["id"], 0),
        (spot_b["id"], 1),
        (spot_c["id"], 2),
    ]
    assert [
        (seg["from_item_id"], seg["to_item_id"]) for seg in after["route_segments"]
    ] == [
        (spot_a["id"], spot_b["id"]),
        (spot_b["id"], spot_c["id"]),
    ]
    assert after["cached_ground_distance_km"] == 9.0
