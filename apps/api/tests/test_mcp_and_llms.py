"""Tests for the Remote Streamable HTTP MCP endpoint (/mcp) and public /llms.txt."""

import json
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
        json={"jsonrpc": "2.0", "id": 1, "method": "initialize"},
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
        "add_itinerary_item",
        "get_fx_rate",
        "get_travel_stats",
        "delete_trip_day",
    }
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
