# Tripilot MCP Server (`tripilot-mcp`)

Standalone Model Context Protocol (MCP) server for **Tripilot**, allowing AI agents (Antigravity, Claude Desktop, Cursor, Gemini CLI, etc.) to manage trips, daily itineraries, Plan A/B day options, expenses, airport lookups, and travel statistics via Tripilot's REST API.

## Requirements

- Python 3.11+
- A running Tripilot API server (`http://localhost:8000` by default)
- A Tripilot Personal API Token (`tp_pat_*`) or local dev token

## Installation

```bash
cd packages/mcp
pip install -e ".[dev]"
```

## Configuration

Set the following environment variables before starting the server:

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `TRIPPILOT_API_URL` | No | `http://localhost:8000` | Base URL of the Tripilot API (without `/api/v1`) |
| `TRIPPILOT_API_TOKEN` | Yes (prod) | `""` | Personal API Token (`tp_pat_...`) or local dev bearer token |

## MCP Client Configuration

Add `tripilot` to your MCP client's server configuration (for example, `mcp_config.json` or `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "tripilot": {
      "command": "tripilot-mcp",
      "env": {
        "TRIPPILOT_API_URL": "http://localhost:8000",
        "TRIPPILOT_API_TOKEN": "tp_pat_your_personal_api_token"
      }
    }
  }
}
```

Or run via `uv` without a global install:

```json
{
  "mcpServers": {
    "tripilot": {
      "command": "uv",
      "args": ["run", "--directory", "/path/to/trip-pilot/packages/mcp", "tripilot-mcp"],
      "env": {
        "TRIPPILOT_API_URL": "http://localhost:8000",
        "TRIPPILOT_API_TOKEN": "tp_pat_your_personal_api_token"
      }
    }
  }
}
```

## Exposed MCP Tools

- `list_trips(status=None)` — List trips optionally filtered by status.
- `get_trip_itinerary(trip_id, day_index=None)` — Fetch full trip itinerary or a single day.
- `create_trip(title, start_date, end_date, country_codes, default_currency="JPY", destination_summary=None)` — Create a trip with auto-generated days and Plan A.
- `create_day_option(trip_day_id, label, clone_from_option_id=None, summary_notes=None)` — Create or clone a Plan B / Rainy Day variant.
- `set_active_day_option(trip_day_id, day_option_id)` — Switch a day's active option.
- `add_itinerary_item(day_option_id, item_type, title, ...)` — Add an item directly to a `DayOption`.
- `add_item_by_date(trip_id, target_date, item_type, title, option_label=None, ...)` — Resolve a calendar date (`YYYY-MM-DD`) and option label/active option, then add an item.
- `update_itinerary_item(item_id, updates)` — Partially update an itinerary item.
- `delete_itinerary_item(item_id)` — Delete an itinerary item.
- `log_expense(trip_id, title, category, amount_original, currency_original, ...)` — Record an actual trip expense.
- `get_travel_stats(year=None)` — Fetch annual or lifetime travel statistics.
- `search_airports(query)` — Search commercial airports by IATA code, city, or name.

## Agent Skill

A companion skill file with ready-to-use workflows (Gmail confirmation parsing, Plan B cloning, and travel stats queries) is included at `skills/trippilot/SKILL.md`.

## Development & Tests

```bash
pytest
ruff check .
```
