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
| `TRIPILOT_API_URL` | No | `http://localhost:8000` | Base URL of the Tripilot API (without `/api/v1`) |
| `TRIPILOT_API_TOKEN` | Yes (prod) | `""` | Personal API Token (`tp_pat_...`) or local dev bearer token |

## MCP Client Configuration

Add `tripilot` to your MCP client's server configuration (for example, `mcp_config.json` or `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "tripilot": {
      "command": "tripilot-mcp",
      "env": {
        "TRIPILOT_API_URL": "http://localhost:8000",
        "TRIPILOT_API_TOKEN": "tp_pat_your_personal_api_token"
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
        "TRIPILOT_API_URL": "http://localhost:8000",
        "TRIPILOT_API_TOKEN": "tp_pat_your_personal_api_token"
      }
    }
  }
}
```

## Exposed MCP Tools

- `list_trips(status=None)` — List trips optionally filtered by status.
- `get_trip(trip_id)` — Fetch full trip itinerary (days, options, items, route legs).
- `create_trip(title, start_date, end_date, country_codes, default_currency="JPY", destination_summary=None)` — Create a trip with auto-generated days and Plan A.
- `append_day(trip_id)` — Append a new calendar day (with default Plan A) to an existing trip.
- `update_day_title(day_id, title=None, notes=None)` — Set or update a day's theme title or notes.
- `create_day_option(day_id, label, clone_from_option_id=None, summary_notes=None)` — Create or clone a Plan B / Rainy Day variant.
- `clone_day_option(option_id, label)` — Deep-clone an existing `DayOption`.
- `rename_day_option(option_id, label)` — Rename an existing `DayOption`.
- `delete_day_option(option_id)` — Delete a `DayOption` (unless it is the last option on the day).
- `set_active_option(day_id, option_id)` — Switch a day's active option.
- `add_itinerary_item(option_id, item_type, title, ...)` — Add an item directly to a `DayOption`.
- `add_item_by_date(trip_id, target_date, item_type, title, option_label=None, ...)` — Resolve a calendar date (`YYYY-MM-DD`) and option label/active option, then add an item.
- `update_itinerary_item(item_id, updates)` — Partially update an itinerary item.
- `delete_itinerary_item(item_id)` — Delete an itinerary item.
- `select_choice_item(item_id)` — Promote an item as the active choice inside its slot group.
- `list_expenses(trip_id)` — List all expenses and category totals for a trip.
- `add_expense(trip_id, title, category, amount_original, currency_original, ...)` — Record an actual trip expense.
- `get_fx_rate(from_currency, to_currency="TWD")` — Fetch live cached exchange rate.
- `get_travel_stats(year=None, scope="all")` — Fetch annual or lifetime travel statistics.
- `search_places(query, lang="zh-TW", limit=5)` — Geocode venues via Google Places / Photon.
- `resolve_google_maps_url(url)` — Resolve a Google Maps share URL into coordinates.
- `search_airports(query)` — Search commercial airports by IATA code, city, or name.

## Agent Skill

A companion skill file with ready-to-use workflows (Gmail confirmation parsing, Plan B cloning, and travel stats queries) is included at `SKILL.md`.

## Development & Tests

```bash
pytest
ruff check .
```
