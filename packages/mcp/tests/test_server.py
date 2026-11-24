"""Smoke tests for Tripilot MCPServer tool registration."""

from __future__ import annotations

from tripilot_mcp.server import mcp


async def test_mcp_server_registers_expected_tools() -> None:
    tools = await mcp.list_tools()
    names = {tool.name for tool in tools}
    assert {
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
        "select_choice_item",
        "search_places",
        "resolve_google_maps_url",
    }.issubset(names)
