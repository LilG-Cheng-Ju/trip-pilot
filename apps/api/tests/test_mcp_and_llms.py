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
