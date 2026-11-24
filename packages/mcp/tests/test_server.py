"""Smoke and unit tests for Tripilot MCPServer tool registration and execution."""

from __future__ import annotations

import pytest

from tripilot_mcp.server import delete_trip_day, mcp


async def test_mcp_server_registers_expected_tools() -> None:
    tools = await mcp.list_tools()
    names = {tool.name for tool in tools}
    expected = {
        "list_trips",
        "get_trip",
        "create_trip",
        "create_day_option",
        "clone_day_option",
        "rename_day_option",
        "delete_day_option",
        "set_active_option",
        "add_itinerary_item",
        "add_item_by_date",
        "update_itinerary_item",
        "delete_itinerary_item",
        "list_expenses",
        "add_expense",
        "get_fx_rate",
        "get_travel_stats",
        "search_airports",
        "update_day_title",
        "append_day",
        "delete_trip_day",
        "select_choice_item",
        "search_places",
        "resolve_google_maps_url",
    }
    assert len(tools) == 23
    assert names == expected


async def test_delete_trip_day_tool_delegates_to_client(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    deleted_ids: list[str] = []

    class _FakeClient:
        async def __aenter__(self) -> _FakeClient:
            return self

        async def __aexit__(self, *_: object) -> None:
            return None

        async def delete_day(self, day_id: str) -> None:
            deleted_ids.append(day_id)

    monkeypatch.setattr("tripilot_mcp.server.TripilotClient", _FakeClient)
    result = await delete_trip_day("day-2")
    assert deleted_ids == ["day-2"]
    assert result == {"deleted": True, "day_id": "day-2"}
