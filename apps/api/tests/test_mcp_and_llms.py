"""Tests for the Remote Streamable HTTP MCP endpoint (/mcp) and public /llms.txt."""

import json
from typing import Any
from unittest.mock import patch

import pytest
from httpx import AsyncClient

from app.services.places import PlaceCandidate


@pytest.mark.asyncio
async def test_llms_txt_is_public_and_documents_mcp(api_client: AsyncClient) -> None:
    resp = await api_client.get("/llms.txt")
    assert resp.status_code == 200
    assert "Tripilot" in resp.text
    assert "/mcp" in resp.text
    assert "details.attachments" in resp.text
    assert "delete_trip_day" in resp.text
    assert "DELETE /api/v1/days/{day_id}" in resp.text
    assert "start_date" in resp.text


@pytest.mark.asyncio
async def test_remote_mcp_lifecycle_and_tool_calls(
    api_client: AsyncClient, dev_headers: dict[str, str]
) -> None:
    unauth = await api_client.post(
        "/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "initialize"}
    )
    assert unauth.status_code == 401

    init = await api_client.post(
        "/mcp",
        headers=dev_headers,
        json={
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-03-26",
                "capabilities": {},
                "clientInfo": {"name": "pytest-client", "version": "1.0.0"},
            },
        },
    )
    assert init.status_code == 200
    assert init.json()["result"]["serverInfo"]["name"] == "tripilot"

    tools = await api_client.post(
        "/mcp",
        headers=dev_headers,
        json={"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
    )
    assert tools.status_code == 200
    tool_names = {t["name"] for t in tools.json()["result"]["tools"]}
    expected = {
        "list_trips",
        "get_trip",
        "create_trip",
        "update_trip",
        "delete_trip",
        "append_day",
        "update_day_title",
        "delete_trip_day",
        "create_day_option",
        "clone_day_option",
        "rename_day_option",
        "delete_day_option",
        "set_active_option",
        "recalculate_option_route",
        "add_itinerary_item",
        "add_item_by_date",
        "update_itinerary_item",
        "delete_itinerary_item",
        "select_choice_item",
        "reorder_itinerary_items",
        "list_trip_shares",
        "create_trip_share",
        "revoke_trip_share",
        "search_places",
        "resolve_google_maps_url",
        "search_airports",
        "resolve_link_title",
        "list_expenses",
        "add_expense",
        "update_expense",
        "delete_expense",
        "get_fx_rate",
        "get_travel_stats",
    }
    assert len(expected) == 33
    assert expected <= tool_names

    fx = await api_client.post(
        "/mcp",
        headers=dev_headers,
        json={
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {
                "name": "get_fx_rate",
                "arguments": {"from_currency": "TWD", "to_currency": "TWD"},
            },
        },
    )
    assert fx.status_code == 200
    payload = json.loads(fx.json()["result"]["content"][0]["text"])
    assert payload["rate"] == 1.0

    # End-to-end MCP trip CRUD: create_trip -> get_trip -> update_day_title -> add_item.
    created = await api_client.post(
        "/mcp",
        headers=dev_headers,
        json={
            "jsonrpc": "2.0",
            "id": 4,
            "method": "tools/call",
            "params": {
                "name": "create_trip",
                "arguments": {
                    "title": "Prague MCP Test",
                    "start_date": "2026-05-01",
                    "end_date": "2026-05-02",
                    "country_codes": ["CZ", "AT"],
                    "default_currency": "EUR",
                },
            },
        },
    )
    trip_id = json.loads(created.json()["result"]["content"][0]["text"])["id"]

    detail_res = await api_client.post(
        "/mcp",
        headers=dev_headers,
        json={
            "jsonrpc": "2.0",
            "id": 5,
            "method": "tools/call",
            "params": {"name": "get_trip", "arguments": {"trip_id": trip_id}},
        },
    )
    detail = json.loads(detail_res.json()["result"]["content"][0]["text"])
    assert detail["id"] == trip_id
    day1_id = detail["days"][0]["id"]
    opt1_id = detail["days"][0]["active_option_id"]

    upd_day = await api_client.post(
        "/mcp",
        headers=dev_headers,
        json={
            "jsonrpc": "2.0",
            "id": 6,
            "method": "tools/call",
            "params": {
                "name": "update_day_title",
                "arguments": {"day_id": day1_id, "title": "Prague Old Town"},
            },
        },
    )
    upd_body = json.loads(upd_day.json()["result"]["content"][0]["text"])
    assert upd_body["title"] == "Prague Old Town"

    add_flt = await api_client.post(
        "/mcp",
        headers=dev_headers,
        json={
            "jsonrpc": "2.0",
            "id": 7,
            "method": "tools/call",
            "params": {
                "name": "add_itinerary_item",
                "arguments": {
                    "option_id": opt1_id,
                    "type": "FLIGHT",
                    "title": "CI67 TPE -> PRG",
                    "details": {"origin_iata": "TPE", "dest_iata": "PRG"},
                },
            },
        },
    )
    assert add_flt.json()["result"]["isError"] is False

    add_by_date = await api_client.post(
        "/mcp",
        headers=dev_headers,
        json={
            "jsonrpc": "2.0",
            "id": 71,
            "method": "tools/call",
            "params": {
                "name": "add_item_by_date",
                "arguments": {
                    "trip_id": trip_id,
                    "target_date": "2026-05-01",
                    "type": "SPOT",
                    "title": "Charles Bridge",
                },
            },
        },
    )
    assert add_by_date.json()["result"]["isError"] is False
    date_item = json.loads(add_by_date.json()["result"]["content"][0]["text"])
    assert date_item["title"] == "Charles Bridge"

    airport_res = await api_client.post(
        "/mcp",
        headers=dev_headers,
        json={
            "jsonrpc": "2.0",
            "id": 72,
            "method": "tools/call",
            "params": {"name": "search_airports", "arguments": {"query": "PRG"}},
        },
    )
    assert airport_res.json()["result"]["isError"] is False
    airports = json.loads(airport_res.json()["result"]["content"][0]["text"])
    assert any(a["iata"] == "PRG" for a in airports)

    list_planning = await api_client.post(
        "/mcp",
        headers=dev_headers,
        json={
            "jsonrpc": "2.0",
            "id": 73,
            "method": "tools/call",
            "params": {"name": "list_trips", "arguments": {"status": "PLANNING"}},
        },
    )
    assert list_planning.json()["result"]["isError"] is False
    planning_trips = json.loads(list_planning.json()["result"]["content"][0]["text"])
    assert any(t["id"] == trip_id for t in planning_trips)

    stats_res = await api_client.post(
        "/mcp",
        headers=dev_headers,
        json={
            "jsonrpc": "2.0",
            "id": 8,
            "method": "tools/call",
            "params": {"name": "get_travel_stats", "arguments": {"year": 2026}},
        },
    )
    stats = json.loads(stats_res.json()["result"]["content"][0]["text"])
    assert stats["total_flight_distance_km"] > 8000.0

    day2_id = detail["days"][1]["id"]
    del_day_res = await api_client.post(
        "/mcp",
        headers=dev_headers,
        json={
            "jsonrpc": "2.0",
            "id": 9,
            "method": "tools/call",
            "params": {"name": "delete_trip_day", "arguments": {"day_id": day2_id}},
        },
    )
    assert del_day_res.status_code == 200
    assert del_day_res.json()["result"]["isError"] is False
    assert json.loads(del_day_res.json()["result"]["content"][0]["text"]) == {
        "deleted": True,
        "day_id": day2_id,
    }


@pytest.mark.asyncio
async def test_mcp_places_tools_serialize_dataclasses_and_enforce_pat_scopes(
    api_client: AsyncClient, dev_headers: dict[str, str]
) -> None:
    fake_candidate = PlaceCandidate(
        name="Senso-ji",
        address="Tokyo, Japan",
        latitude=35.7147,
        longitude=139.7966,
        google_maps_url="https://maps.google.com/?cid=1",
        provider="google_places",
    )

    class _FakeProvider:
        async def search(
            self, query: str, language: str = "zh-TW", limit: int = 5
        ) -> list[PlaceCandidate]:
            del query, language, limit
            return [fake_candidate]

    with patch(
        "app.api.v1.mcp.get_place_search_provider", return_value=_FakeProvider()
    ):
        places_res = await api_client.post(
            "/mcp",
            headers=dev_headers,
            json={
                "jsonrpc": "2.0",
                "id": 10,
                "method": "tools/call",
                "params": {"name": "search_places", "arguments": {"query": "Senso-ji"}},
            },
        )
    assert places_res.status_code == 200
    assert places_res.json()["result"]["isError"] is False
    parsed_places = json.loads(places_res.json()["result"]["content"][0]["text"])
    assert parsed_places[0]["name"] == "Senso-ji"

    resolve_res = await api_client.post(
        "/mcp",
        headers=dev_headers,
        json={
            "jsonrpc": "2.0",
            "id": 11,
            "method": "tools/call",
            "params": {
                "name": "resolve_google_maps_url",
                "arguments": {
                    "url": "https://www.google.com/maps/place/Tokyo+Tower/@35.65858,139.74543,17z"
                },
            },
        },
    )
    assert resolve_res.status_code == 200
    assert resolve_res.json()["result"]["isError"] is False
    resolved = json.loads(resolve_res.json()["result"]["content"][0]["text"])
    assert resolved["name"] == "Tokyo Tower"

    # Mint a read-only PAT with only trips:read and verify scope enforcement on /mcp.
    token_resp = await api_client.post(
        "/api/v1/tokens",
        headers=dev_headers,
        json={"name": "Read Only MCP", "scopes": ["trips:read"]},
    )
    assert token_resp.status_code == 201
    pat_headers = {"Authorization": f"Bearer {token_resp.json()['plaintext_token']}"}

    allowed = await api_client.post(
        "/mcp",
        headers=pat_headers,
        json={
            "jsonrpc": "2.0",
            "id": 12,
            "method": "tools/call",
            "params": {"name": "list_trips", "arguments": {}},
        },
    )
    assert allowed.status_code == 200
    assert allowed.json()["result"]["isError"] is False

    for req_id, tool_name, arguments in (
        (
            13,
            "create_trip",
            {
                "title": "Blocked",
                "start_date": "2026-06-01",
                "end_date": "2026-06-02",
                "country_codes": ["JP"],
            },
        ),
        (
            14,
            "add_expense",
            {
                "trip_id": "missing",
                "title": "Coffee",
                "category": "FOOD",
                "amount_original": 500,
                "currency_original": "JPY",
            },
        ),
        (15, "get_travel_stats", {"year": 2026}),
    ):
        denied = await api_client.post(
            "/mcp",
            headers=pat_headers,
            json={
                "jsonrpc": "2.0",
                "id": req_id,
                "method": "tools/call",
                "params": {"name": tool_name, "arguments": arguments},
            },
        )
        assert denied.status_code == 200
        assert denied.json()["error"]["code"] == -32003


@pytest.mark.asyncio
async def test_mcp_protocol_validation_and_notifications(
    api_client: AsyncClient, dev_headers: dict[str, str]
) -> None:
    malformed = await api_client.post(
        "/mcp",
        headers={**dev_headers, "Content-Type": "application/json"},
        content=b"{not-valid-json",
    )
    assert malformed.status_code == 400
    assert malformed.json()["error"]["code"] == -32700

    batch = await api_client.post(
        "/mcp",
        headers=dev_headers,
        json=[{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}],
    )
    assert batch.status_code == 400
    assert batch.json()["error"]["code"] == -32602

    notif = await api_client.post(
        "/mcp",
        headers=dev_headers,
        json={"jsonrpc": "2.0", "method": "notifications/initialized"},
    )
    assert notif.status_code == 202


@pytest.mark.asyncio
async def test_mcp_auto_fx_expense_flat_patches_and_schema_parity(
    api_client: AsyncClient, dev_headers: dict[str, str]
) -> None:
    tools_res = await api_client.post(
        "/mcp",
        headers=dev_headers,
        json={"jsonrpc": "2.0", "id": 20, "method": "tools/list"},
    )
    assert tools_res.status_code == 200
    tools_by_name = {t["name"]: t for t in tools_res.json()["result"]["tools"]}
    assert len(tools_by_name) == 33
    add_props = tools_by_name["add_itinerary_item"]["inputSchema"]["properties"]
    assert "type" in add_props
    assert "item_type" not in add_props
    upd_props = tools_by_name["update_itinerary_item"]["inputSchema"]["properties"]
    assert "title" in upd_props
    assert "limit" in tools_by_name["search_airports"]["inputSchema"]["properties"]
    assert "notes" in tools_by_name["update_day_title"]["inputSchema"]["properties"]
    assert "exchange_rate" not in tools_by_name["add_expense"]["inputSchema"].get(
        "required", []
    )

    trip_res = await api_client.post(
        "/mcp",
        headers=dev_headers,
        json={
            "jsonrpc": "2.0",
            "id": 21,
            "method": "tools/call",
            "params": {
                "name": "create_trip",
                "arguments": {
                    "title": "Kyoto AutoFX Test",
                    "start_date": "2026-09-10",
                    "end_date": "2026-09-10",
                    "country_codes": ["JP"],
                },
            },
        },
    )
    trip = json.loads(trip_res.json()["result"]["content"][0]["text"])
    day_id = trip["days"][0]["id"]
    opt_id = trip["days"][0]["active_option_id"]

    day_res = await api_client.post(
        "/mcp",
        headers=dev_headers,
        json={
            "jsonrpc": "2.0",
            "id": 22,
            "method": "tools/call",
            "params": {
                "name": "update_day_title",
                "arguments": {
                    "day_id": day_id,
                    "title": "Higashiyama Walk",
                    "notes": "Bring ICOCA",
                },
            },
        },
    )
    updated_day = json.loads(day_res.json()["result"]["content"][0]["text"])
    assert updated_day["title"] == "Higashiyama Walk"
    assert updated_day["notes"] == "Bring ICOCA"

    item_res = await api_client.post(
        "/mcp",
        headers=dev_headers,
        json={
            "jsonrpc": "2.0",
            "id": 23,
            "method": "tools/call",
            "params": {
                "name": "add_itinerary_item",
                "arguments": {
                    "option_id": opt_id,
                    "type": "SPOT",
                    "title": "Kiyomizu",
                },
            },
        },
    )
    item = json.loads(item_res.json()["result"]["content"][0]["text"])

    patch_res = await api_client.post(
        "/mcp",
        headers=dev_headers,
        json={
            "jsonrpc": "2.0",
            "id": 24,
            "method": "tools/call",
            "params": {
                "name": "update_itinerary_item",
                "arguments": {
                    "item_id": item["id"],
                    "title": "Kiyomizu-dera",
                    "start_time": "8:30",
                    "notes": "Arrive early",
                },
            },
        },
    )
    patched = json.loads(patch_res.json()["result"]["content"][0]["text"])
    assert patched["title"] == "Kiyomizu-dera"
    assert patched["start_time"] == "08:30"
    assert patched["notes"] == "Arrive early"

    class _FakeFx:
        async def get_rate(self, src: str, dst: str) -> tuple[float, str, bool]:
            assert src == "JPY"
            assert dst == "TWD"
            return 0.215, "fake-fx", False

    with patch("app.services.expense_service.get_fx_provider", return_value=_FakeFx()):
        exp_res = await api_client.post(
            "/mcp",
            headers=dev_headers,
            json={
                "jsonrpc": "2.0",
                "id": 25,
                "method": "tools/call",
                "params": {
                    "name": "add_expense",
                    "arguments": {
                        "trip_id": trip["id"],
                        "title": "Matcha Parfait",
                        "category": "FOOD",
                        "amount_original": 2000,
                        "currency_original": "JPY",
                        "itinerary_item_id": item["id"],
                    },
                },
            },
        )
    exp = json.loads(exp_res.json()["result"]["content"][0]["text"])
    assert exp["trip_id"] == trip["id"]
    assert exp["currency_home"] == "TWD"
    assert float(exp["exchange_rate"]) == pytest.approx(0.215)
    assert float(exp["amount_home"]) == pytest.approx(430.0)
    assert "paid_at" in exp


@pytest.mark.asyncio
async def test_remote_mcp_full_parity_tools(
    api_client: AsyncClient, dev_headers: dict[str, str]
) -> None:
    async def _call(tool_name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        resp = await api_client.post(
            "/mcp",
            headers=dev_headers,
            json={
                "jsonrpc": "2.0",
                "id": 99,
                "method": "tools/call",
                "params": {"name": tool_name, "arguments": arguments},
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "error" not in body, body
        assert body["result"]["isError"] is False, body
        parsed: dict[str, Any] = json.loads(body["result"]["content"][0]["text"])
        return parsed

    trip = await _call(
        "create_trip",
        {
            "title": "Seoul Draft",
            "start_date": "2026-10-01",
            "end_date": "2026-10-02",
            "country_codes": ["KR"],
            "default_currency": "KRW",
        },
    )
    trip_id = str(trip["id"])
    days = trip["days"]
    assert isinstance(days, list)
    opt_id = str(days[0]["active_option_id"])

    updated_trip = await _call(
        "update_trip",
        {
            "trip_id": trip_id,
            "title": "Seoul Autumn",
            "start_date": "2026-10-03",
            "status": "ACTIVE",
        },
    )
    assert updated_trip["title"] == "Seoul Autumn"
    assert updated_trip["start_date"] == "2026-10-03"
    assert updated_trip["end_date"] == "2026-10-04"
    assert updated_trip["status"] == "ACTIVE"

    item1 = await _call(
        "add_itinerary_item",
        {"option_id": opt_id, "type": "SPOT", "title": "Gyeongbokgung"},
    )
    item2 = await _call(
        "add_itinerary_item",
        {"option_id": opt_id, "type": "FOOD", "title": "Tosokchon"},
    )
    reordered = await _call(
        "reorder_itinerary_items",
        {"option_id": opt_id, "item_ids": [item2["id"], item1["id"]]},
    )
    reordered_items = reordered["items"]
    assert isinstance(reordered_items, list)
    assert [it["id"] for it in reordered_items] == [item2["id"], item1["id"]]

    recalc = await _call("recalculate_option_route", {"option_id": opt_id})
    assert recalc["id"] == opt_id

    share = await _call(
        "create_trip_share",
        {
            "trip_id": trip_id,
            "label": "Friends",
            "include_notes": True,
            "expires_at": "2027-01-01",
        },
    )
    assert share["label"] == "Friends"
    shares_list = await api_client.post(
        "/mcp",
        headers=dev_headers,
        json={
            "jsonrpc": "2.0",
            "id": 100,
            "method": "tools/call",
            "params": {"name": "list_trip_shares", "arguments": {"trip_id": trip_id}},
        },
    )
    assert len(json.loads(shares_list.json()["result"]["content"][0]["text"])) == 1
    revoked = await _call(
        "revoke_trip_share", {"trip_id": trip_id, "share_id": share["id"]}
    )
    assert revoked == {"revoked": True, "share_id": share["id"]}

    with patch(
        "app.api.v1.mcp.fetch_cloud_link_title",
        return_value="Seoul_Tickets.pdf",
    ):
        link_res = await _call(
            "resolve_link_title",
            {"url": "https://drive.google.com/file/d/abc123/view"},
        )
    assert link_res == {"title": "Seoul_Tickets.pdf"}

    class _FakeFx:
        async def get_rate(self, src: str, dst: str) -> tuple[float, str, bool]:
            assert dst == "TWD"
            return (0.024 if src == "KRW" else 32.0), "fake", False

    with patch("app.services.expense_service.get_fx_provider", return_value=_FakeFx()):
        exp = await _call(
            "add_expense",
            {
                "trip_id": trip_id,
                "title": "Samgyetang",
                "category": "FOOD",
                "amount_original": 20000,
                "currency_original": "KRW",
                "paid_at": "2026-10-03",
            },
        )
        assert exp["paid_at"].startswith("2026-10-03")
        assert float(exp["amount_home"]) == pytest.approx(480.0)

        # Updating currency_original without exchange_rate refreshes FX automatically.
        updated_exp = await _call(
            "update_expense",
            {
                "expense_id": exp["id"],
                "amount_original": 10,
                "currency_original": "USD",
            },
        )
        assert updated_exp["currency_original"] == "USD"
        assert float(updated_exp["exchange_rate"]) == pytest.approx(32.0)
        assert float(updated_exp["amount_home"]) == pytest.approx(320.0)

    deleted_exp = await _call("delete_expense", {"expense_id": exp["id"]})
    assert deleted_exp == {"deleted": True, "expense_id": exp["id"]}

    deleted_trip = await _call("delete_trip", {"trip_id": trip_id})
    assert deleted_trip == {"deleted": True, "trip_id": trip_id}

