---
name: tripilot
description: Manage trips, daily itineraries (including Day Themes, Plan A/B day options, and slot-level multi-choice alternatives), travel expenses, Google Places lookups, airport lookups, and annual/lifetime travel stats through Tripilot (MCP or REST API).
---

# Tripilot Agent Skill

Use Tripilot's MCP tools (or `/api/v1` REST API with `TRIPPILOT_API_TOKEN`) to read and update the user's travel workspace cleanly.

## Core Data Model

- **Trip -> TripDay -> DayOption -> ItineraryItem**:
  - Every trip auto-generates one `TripDay` per calendar date (`day_index` 1..N), each with a default `Plan A` `DayOption` set as `active_option_id`.
  - Always set a concise **Day Theme (`TripDay.title`)** summarizing the main area/focus of each day (e.g., `東釜山體驗日 · 滑車＋天空膠囊`, `Shibuya & Meiji Shrine`) via `PATCH /api/v1/days/{day_id}`.
- **Item types (`type` / `item_type`)**:
  - `FLIGHT`: Commercial flights. Include `origin_iata`, `dest_iata`, `flight_number`, `booking_ref`, `origin_terminal`, `dest_terminal`, `seat` in `details`. The backend auto-computes Great-Circle `distance_km` and auto-pins the destination/foreign airport coordinates on the map.
  - `RESERVED_TRANSIT`: Booked rail, Shinkansen, express bus, capsule train, or ferry (`operator`, `line_or_train_no`, `car_number`, `seat`, `booking_ref`, `local_name` in `details`).
  - `LOCAL_TRANSIT`: Metro, bus, taxi, or walking connectors between stops (`mode`, `duration_minutes` in `details`).
  - `STAY`: Hotels or accommodations (`check_in_time`, `check_out_time`, `confirmation_code`, `free_cancellation_deadline`, `local_name` in `details`). The UI automatically inherits the latest geolocated `STAY` across subsequent days until a new `STAY` is added.
  - `SPOT`: Sightseeing, museums, parks, activities (`local_name` in `details`).
  - `FOOD`: Restaurants, cafes, bars (`reservation_required`, `reservation_code`, `local_name` in `details`).
- **Always populate `details.local_name` for international stops**:
  - Whenever adding a `STAY`, `SPOT`, `FOOD`, or `RESERVED_TRANSIT` in a non-Chinese/non-English destination (especially **Japan** and **South Korea**), ALWAYS include `details["local_name"]` with the authentic local-language venue name (e.g., `"浅草今半"`, `"一蘭 渋谷店"`, `"소타스위트 서면"`, `"해동용궁사"`).
  - Tripilot renders a subtle one-tap copy chip whenever `details.local_name` is present so the traveler can paste it straight into Kakao T, Uber, GO Taxi, or Naver Map.
- **Geolocation for Map Pins**:
  - Call `GET /api/v1/places/search?q=<query>&lang=zh-TW` (backed by Google Places API New) or `POST /api/v1/places/resolve-url` to populate `latitude`, `longitude`, `address`, and `google_maps_url` for every `SPOT`, `FOOD`, `STAY`, and `RESERVED_TRANSIT`.
- **Expense categories (`category`)**: `FLIGHT`, `LODGING`, `TRANSIT`, `FOOD`, `ACTIVITY`, `SHOPPING`, `OTHER`.

---

## Recipe 1: Parse Gmail Confirmations into Itinerary + Expenses

1. **Locate the target trip**: Call `list_trips()` to find the matching `trip_id` (or create one with `create_trip`).
2. **Enrich airports & places**:
   - For flights, verify IATA codes with `search_airports`.
   - For hotels/restaurants/stations, look up coordinates & `local_name`.
3. **Insert the item by date**:
   - Call `add_item_by_date(...)` with `target_date="YYYY-MM-DD"`:
     - Flights -> `item_type="FLIGHT"`, `details={"flight_number": "...", "origin_iata": "...", "dest_iata": "...", "booking_ref": "..."}`.
     - Hotels -> `item_type="STAY"` on check-in date, `details={"check_in_time": "15:00", "check_out_time": "11:00", "confirmation_code": "...", "free_cancellation_deadline": "...", "local_name": "..."}`.
     - Trains / buses -> `item_type="RESERVED_TRANSIT"`, `details={"operator": "...", "line_or_train_no": "...", "seat": "...", "booking_ref": "...", "local_name": "..."}`.
4. **Log the paid cost (if present in the email)**:
   - Call `log_expense(...)` using `FLIGHT`, `LODGING`, or `TRANSIT`. Never fabricate exchange rates if unknown.

---

## Recipe 2: Whole-Day Plan B vs. Slot-Level Multi-Choice Alternatives

Choose the right mechanism for alternatives:
- **Whole-day variant (e.g., Sunny vs. Rainy Day)**:
  1. Call `create_day_option(trip_day_id=..., label="Plan B · 雨天備案", clone_from_option_id=<active_option_id>)`.
  2. Edit only the cloned option; keep `Plan A` active unless the user explicitly asks to switch via `set_active_day_option`.
- **Single-slot multi-choice (e.g., 3 lunch candidates or 2 dinner candidates on the same day)**:
  1. Add the primary choice normally (`is_selected=True`).
  2. Add each alternative with `alternative_for_item_id=<primary_item.id>` — Tripilot groups them under one `choice_group_id` so the user can switch inline without duplicating the whole day.

---

## Recipe 3: Query Annual or Lifetime Travel Stats

Call `get_travel_stats(year=2026)` (or `year=None` for lifetime). Active day options and selected choice items are aggregated automatically without double-counting backup plans.
