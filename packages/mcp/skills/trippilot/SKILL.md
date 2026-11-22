---
name: tripilot
description: Manage trips, daily itineraries (including Plan A/B day options), travel expenses, airport lookups, and annual/lifetime travel stats through the Tripilot MCP server.
---

# Tripilot Agent Skill

Use the `tripilot` MCP tools to read and update the user's Tripilot workspace without manual copy-pasting.

## Core Concepts

- **Trip -> TripDay -> DayOption -> ItineraryItem**: Every trip auto-generates one `TripDay` per calendar date, each with a default `Plan A` `DayOption` set as `active_option_id`.
- **Item types (`item_type`)**:
  - `FLIGHT`: Commercial flights (include `dep_iata`, `arr_iata`, `flight_number`, `booking_ref`, `terminal`, `seat` in `details`).
  - `RESERVED_TRANSIT`: Booked long-distance rail, Shinkansen, express bus, or ferry (`operator`, `train_number`, `car`, `seat`, `booking_ref` in `details`).
  - `LOCAL_TRANSIT`: Metro, bus, taxi, or walking transfers.
  - `STAY`: Hotels or vacation rentals (`check_in`, `check_out`, `booking_ref` in `details`).
  - `SPOT`: Sightseeing, museums, parks, activities.
  - `FOOD`: Restaurants, cafes, bars.
- **Expense categories (`category`)**: `FLIGHT`, `LODGING`, `TRANSIT`, `FOOD`, `ACTIVITY`, `SHOPPING`, `OTHER`.

---

## Recipe 1: Parse Gmail Confirmations into Itinerary + Expenses

When the user asks to import a flight, hotel, or train confirmation email:

1. **Locate the target trip**:
   - Call `list_trips(status="PLANNING")` (or `list_trips()`) to find the matching `trip_id`.
   - If no trip covers those dates, confirm with the user or call `create_trip(...)`.
2. **Enrich flights with airport data**:
   - For flights, call `search_airports(query=<IATA or city>)` for both departure and arrival airports to verify exact IATA codes, coordinates, and timezones.
3. **Insert the itinerary item by date**:
   - Call `add_item_by_date(...)` with `target_date="YYYY-MM-DD"`:
     - Flights -> `item_type="FLIGHT"`, `details={"flight_number": "...", "dep_iata": "...", "arr_iata": "...", "booking_ref": "...", "terminal": "..."}`.
     - Hotels -> `item_type="STAY"` on check-in date (and optional checkout reminder), `details={"check_in": "15:00", "check_out": "11:00", "booking_ref": "..."}`.
     - Shinkansen / express trains -> `item_type="RESERVED_TRANSIT"`, `details={"operator": "...", "train_number": "...", "car": "...", "seat": "...", "booking_ref": "..."}`.
4. **Log the paid cost (if present in the email)**:
   - Call `log_expense(trip_id=..., title=..., category=..., amount_original=..., currency_original=..., exchange_rate=..., payment_method=...)` using `FLIGHT`, `LODGING`, or `TRANSIT` as appropriate.
   - Never fabricate exchange rates if unknown; ask or default `exchange_rate=1.0` when `currency_original` matches the user's home currency.

---

## Recipe 2: Build a Plan B / Rainy Day Backup Without Disrupting Plan A

When the user asks for an indoor, rainy-day, or relaxed alternative for a specific day:

1. Call `get_trip_itinerary(trip_id=..., day_index=...)` to inspect the target `TripDay`, its `id` (`trip_day_id`), and its current `active_option_id` (usually `Plan A`).
2. Call `create_day_option`:
   - Pass `trip_day_id=<day.id>`, `label="Plan B - Rainy Day"`, and `clone_from_option_id=<day.active_option_id>` so fixed anchors (flights, hotels, reserved trains) are preserved automatically.
   - Notice this does **not** overwrite `Plan A` or switch `active_option_id`.
3. Modify only the new option:
   - Use `delete_itinerary_item(item_id=...)` to remove outdoor spots from the cloned option, and `add_itinerary_item(day_option_id=<new_option.id>, ...)` or `add_item_by_date(..., option_label="Plan B - Rainy Day")` to add indoor replacements.
4. Only call `set_active_day_option(trip_day_id=..., day_option_id=...)` if the user explicitly asks to activate Plan B.

---

## Recipe 3: Query Annual or Lifetime Travel Stats

When the user asks "how many countries did I visit in 2025?", "how far did I fly this year?", or "what is my lifetime travel spend?":

1. Call `get_travel_stats(year=2025)` for a specific calendar year, or `get_travel_stats()` for lifetime totals.
2. Summarize `total_trips`, `international_trips`, `countries_visited`, `total_travel_days`, `total_flight_distance_km`, `total_ground_distance_km`, and `total_spend_home` (with `spend_by_category` breakdown).
3. Remind the user if relevant that stats only count each day's active `DayOption`, so backup Plan B options are never double-counted.
