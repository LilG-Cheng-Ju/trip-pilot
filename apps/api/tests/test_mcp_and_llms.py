"""Tests for the Remote Streamable HTTP MCP endpoint (/mcp) and public /llms.txt."""

import json

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_llms_txt_is_public_and_documents_mcp(api_client: AsyncClient) -> None:
    resp = await api_client.get("/llms.txt")
    assert resp.status_code == 200
    assert "Tripilot" in resp.text
    assert "/mcp" in resp.text
    assert "details.attachments" in resp.text


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
    expected = {"list_trips", "add_itinerary_item", "get_fx_rate", "get_travel_stats"}
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
