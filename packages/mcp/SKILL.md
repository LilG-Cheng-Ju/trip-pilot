---
name: tripilot
description: Manage trips, daily itineraries (including Day Themes, Plan A/B day options, slot-level multi-choice alternatives, and cloud attachments), travel expenses with live FX rates, Google Places lookups, airport lookups, and annual/lifetime travel stats through Tripilot (Remote MCP, local MCP, or REST API).
---

# Tripilot Agent Skill

Use Tripilot's Remote MCP endpoint (`POST <API_URL>/mcp`), local MCP tools, or `/api/v1` REST API with `Authorization: Bearer tp_pat_...` to read and update the user's travel workspace cleanly.

- **Public AI Guide**: `GET <API_URL>/llms.txt` (English quick reference)
- **OpenAPI Schema**: `GET <API_URL>/api/v1/openapi.json`
- **Remote MCP (Streamable HTTP / JSON-RPC 2.0)**: `POST <API_URL>/mcp`

## Core Data Model

- **Trip -> TripDay -> DayOption -> ItineraryItem**:
  - Every trip auto-generates one `TripDay` per calendar date (`day_index` 1..N), each with a default `Plan A` `DayOption` set as `active_option_id`.
  - Always set a concise **Day Theme (`TripDay.title`)** summarizing the main area/focus of each day (e.g., `東釜山體驗日 · 滑車＋天空膠囊`, `Prague Old Town & Castle`) via `update_day_title` or `PATCH /api/v1/days/{day_id}`.
- **Item types (`type` / `item_type`)**:
  - `FLIGHT`: Commercial flights. Include `origin_iata`, `dest_iata`, `flight_number`, `booking_ref`, `origin_terminal`, `dest_terminal`, `seat` in `details`. The backend auto-computes Great-Circle `distance_km` and auto-pins the destination/foreign airport coordinates on the map.
  - `RESERVED_TRANSIT`: Booked rail, Shinkansen, KTX, ÖBB, RegioJet, express bus, or ferry (`operator`, `line_or_train_no`, `car_number`, `seat`, `booking_ref`, `local_name` in `details`). Automatically listed in the Trip Brief page.
  - `LOCAL_TRANSIT`: Metro, bus, taxi, or walking connectors between stops (`mode`, `duration_minutes` in `details`).
  - `STAY`: Hotels or accommodations (`check_in_time`, `check_out_time`, `confirmation_code`, `free_cancellation_deadline`, `local_name` in `details`). Place a `STAY` on each check-in day — Tripilot's **Trip Brief** automatically computes check-in -> check-out night spans and flags hotel changes, while the map inherits the active basecamp hotel across subsequent days.
  - `SPOT`: Sightseeing, museums, parks, activities (`local_name` in `details`).
  - `FOOD`: Restaurants, cafes, bars (`reservation_required`, `reservation_code`, `local_name` in `details`).
- **Cloud Attachments (`details.attachments`)**:
  - Attach tickets, boarding passes, PDFs, or Drive folders via `details["attachments"] = [{"name": "BR169_Ticket.pdf", "url": "https://drive.google.com/..."}]`.
  - Attachments appear as 1-tap rounded chips on itinerary cards, are aggregated in the **Trip Brief** attachments vault, and are automatically stripped on public shares when booking refs are hidden.
  - To resolve a filename from a whitelisted cloud link (Google Drive, Dropbox, OneDrive), call `POST /api/v1/links/resolve-title`.
- **Always populate `details.local_name` for international stops**:
  - Whenever adding a `STAY`, `SPOT`, `FOOD`, or `RESERVED_TRANSIT` in a non-Chinese/non-English destination (Japan, South Korea, Europe, etc.), ALWAYS include `details["local_name"]` with the authentic native-language venue name so the traveler can 1-tap copy it into taxi/map apps.
- **Geolocation for Map Pins**:
  - Call `search_places` (`GET /api/v1/places/search?q=<query>&lang=zh-TW`) or `resolve_google_maps_url` (`POST /api/v1/places/resolve-url`) to populate `latitude`, `longitude`, `address`, and `google_maps_url` for every `SPOT`, `FOOD`, `STAY`, and `RESERVED_TRANSIT`.
- **Expenses & Live FX**:
  - Categories: `FLIGHT`, `LODGING`, `TRANSIT`, `FOOD`, `ACTIVITY`, `SHOPPING`, `OTHER`.
  - Link expenses to a specific stop via `trip_day_id` and `itinerary_item_id` so they group cleanly on cards and filter in `/trips/:id/expenses?itemId=...`.
  - Query live cached exchange rates with `get_fx_rate` (`GET /api/v1/fx/rate?from=JPY&to=TWD`) — never fabricate exchange rates.

---

## Recipe 1: Parse Gmail / Drive Confirmations into Itinerary + Expenses

1. **Locate or create the target trip**: Call `list_trips` or `create_trip`.
2. **Enrich airports & places**:
   - Verify flight IATA codes and look up coordinates + `local_name` for hotels, restaurants, and stations via `search_places`.
3. **Insert items by date & attach cloud links**:
   - Add `FLIGHT`, `STAY` (on check-in dates), and `RESERVED_TRANSIT` items with `details.attachments` pointing to any Drive tickets/vouchers.
4. **Log paid costs**:
   - Fetch the live rate via `get_fx_rate` and call `add_expense` with `itinerary_item_id` linked to the created item.

---

## Recipe 2: Whole-Day Plans vs. Slot-Level Alternatives

- **Whole-day variant (e.g., Rainy Day Plan B)**: Call `clone_day_option(option_id=..., label="Plan B · 雨天")` and edit the cloned option.
- **Single-slot multi-choice (e.g., 3 lunch candidates)**: Add the primary choice normally, then add each alternative with `alternative_for_item_id=<primary_item.id>`.

---

## Recipe 3: Query Dashboard Travel Stats

Call `get_travel_stats(year=2026, scope="all")` (`scope` supports `"all"`, `"international"`, or `"domestic"`; `year=None` for all-time). Active day options and selected choice items are aggregated automatically without double-counting backup plans.
