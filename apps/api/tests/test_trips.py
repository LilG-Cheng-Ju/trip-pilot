"""Integration tests for Trips, DayOptions (Plan A/B), Items, and Share privacy."""

import pytest
from httpx import AsyncClient


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

    # Clone Plan A into Plan B · Rainy and switch active option.
    clone_resp = await api_client.post(
        f"/api/v1/options/{plan_a_id}/clone",
        headers=dev_headers,
        json={"label": "Plan B · Rainy"},
    )
    assert clone_resp.status_code == 201
    plan_b_id = clone_resp.json()["id"]
    assert len(clone_resp.json()["items"]) == 2

    switch_resp = await api_client.patch(
        f"/api/v1/days/{day1['id']}/active-option",
        headers=dev_headers,
        json={"day_option_id": plan_b_id},
    )
    assert switch_resp.status_code == 200
    assert switch_resp.json()["active_option_id"] == plan_b_id


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

    await api_client.post(
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
    await api_client.post(
        f"/api/v1/days/{day1['id']}/options",
        headers=dev_headers,
        json={"label": "Plan B · Rainy"},
    )

    # Default share hides booking_ref, notes, and backup options.
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
    pub_item = pub_trip["days"][0]["options"][0]["items"][0]
    assert pub_item["notes"] is None
    assert "booking_ref" not in pub_item["details"]
    assert pub_item["details"]["origin_iata"] == "TPE"

    # Companion share explicitly exposes booking_ref and backup options.
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
    comp_item = comp_pub["days"][0]["options"][0]["items"][0]
    assert comp_item["details"]["booking_ref"] == "PNR-XYZ123"
    assert comp_item["notes"] == "Private passport reminder"
