"""Smoke and unit tests for Tripilot MCPServer tool registration and execution."""

from __future__ import annotations

from typing import Any

import pytest

from tripilot_mcp.server import (
    add_expense,
    close_shared_client,
    delete_trip_day,
    mcp,
    update_itinerary_item,
)

EXPECTED_TOOL_PARAMS: dict[str, set[str]] = {
    "list_trips": {"status"},
    "get_trip": {"trip_id", "day_index"},
    "create_trip": {
        "title",
        "start_date",
        "end_date",
        "country_codes",
        "default_currency",
        "destination_summary",
    },
    "append_day": {"trip_id"},
    "update_day_title": {"day_id", "title", "notes"},
    "delete_trip_day": {"day_id"},
    "create_day_option": {
        "day_id",
        "label",
        "clone_from_option_id",
        "summary_notes",
    },
    "clone_day_option": {"option_id", "label"},
    "rename_day_option": {"option_id", "label"},
    "delete_day_option": {"option_id"},
    "set_active_option": {"day_id", "option_id"},
    "add_itinerary_item": {
        "option_id",
        "type",
        "title",
        "start_time",
        "end_time",
        "address",
        "latitude",
        "longitude",
        "google_maps_url",
        "notes",
        "details",
        "alternative_for_item_id",
    },
    "add_item_by_date": {
        "trip_id",
        "target_date",
        "type",
        "title",
        "option_label",
        "start_time",
        "end_time",
        "address",
        "latitude",
        "longitude",
        "google_maps_url",
        "notes",
        "details",
        "alternative_for_item_id",
    },
    "update_itinerary_item": {
        "item_id",
        "type",
        "sort_order",
        "is_selected",
        "title",
        "start_time",
        "end_time",
        "address",
        "latitude",
        "longitude",
        "google_maps_url",
        "notes",
        "details",
    },
    "delete_itinerary_item": {"item_id"},
    "select_choice_item": {"item_id"},
    "search_places": {"query", "lang", "limit"},
    "resolve_google_maps_url": {"url"},
    "search_airports": {"query", "limit"},
    "list_expenses": {"trip_id"},
    "add_expense": {
        "trip_id",
        "title",
        "category",
        "amount_original",
        "currency_original",
        "exchange_rate",
        "trip_day_id",
        "itinerary_item_id",
        "payment_method",
        "notes",
    },
    "get_fx_rate": {"from_currency", "to_currency"},
    "get_travel_stats": {"year", "scope"},
}


async def test_mcp_server_registers_aligned_tools_and_schemas() -> None:
    tools = await mcp.list_tools()
    by_name = {tool.name: tool for tool in tools}
    assert len(tools) == 23
    assert set(by_name) == set(EXPECTED_TOOL_PARAMS)

    for name, expected_params in EXPECTED_TOOL_PARAMS.items():
        props = set(by_name[name].input_schema.get("properties", {}))
        assert props == expected_params, f"Schema mismatch on {name}: {props}"

    assert "exchange_rate" not in by_name["add_expense"].input_schema.get(
        "required", []
    )
    assert "type" in by_name["add_itinerary_item"].input_schema.get("required", [])
    assert "type" in by_name["add_item_by_date"].input_schema.get("required", [])


async def test_shared_client_reused_and_unified_payloads(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    instantiations = 0
    closed_count = 0
    deleted_ids: list[str] = []
    expense_payloads: list[dict[str, Any]] = []
    item_patches: list[tuple[str, dict[str, Any]]] = []

    class _FakeClient:
        def __init__(self) -> None:
            nonlocal instantiations
            instantiations += 1

        async def aclose(self) -> None:
            nonlocal closed_count
            closed_count += 1

        async def delete_day(self, day_id: str) -> None:
            deleted_ids.append(day_id)

        async def log_expense(
            self, trip_id: str, payload: dict[str, Any]
        ) -> dict[str, Any]:
            expense_payloads.append(payload)
            return {"id": "exp-1", "trip_id": trip_id, **payload}

        async def update_item(
            self, item_id: str, payload: dict[str, Any]
        ) -> dict[str, Any]:
            item_patches.append((item_id, payload))
            return {"id": item_id, **payload}

    await close_shared_client()
    monkeypatch.setattr("tripilot_mcp.server.TripilotClient", _FakeClient)
    try:
        res_del = await delete_trip_day("day-2")
        assert res_del == {"deleted": True, "day_id": "day-2"}

        res_exp = await add_expense(
            trip_id="trip-1",
            title="Matcha",
            category="FOOD",
            amount_original=800,
            currency_original="jpy",
        )
        assert res_exp["currency_original"] == "JPY"
        assert "exchange_rate" not in expense_payloads[0]

        res_item = await update_itinerary_item(
            item_id="item-1", title="Senso-ji", start_time="09:00", notes=None
        )
        assert res_item["title"] == "Senso-ji"
        assert item_patches == [
            ("item-1", {"title": "Senso-ji", "start_time": "09:00"})
        ]
        assert instantiations == 1

        await close_shared_client()
        assert closed_count == 1
        await delete_trip_day("day-3")
        assert instantiations == 2
        assert deleted_ids == ["day-2", "day-3"]
    finally:
        await close_shared_client()
