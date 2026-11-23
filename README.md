# Tripilot

**Mobile-First, Agent-Native Travel Itinerary Platform.**

Tripilot pairs a calm, one-handed mobile PWA (Refined Japanese Deep Navy `#1B2A4A`, Warm Champagne Gold `#C89B5B`, Terracotta `#D96B52`, and Warm Off-White `#F7F6F2`) with a structured travel data model and first-class Antigravity / Gemini MCP integration.

## Highlights

- **Multi-Trip Overview**: Manage domestic and international trips across `Upcoming` and `Completed` tabs with searchable multi-country selection (50+ countries), departure countdowns, and flexible return dates (`End Date`, `Trip Length`, or `Decide Later` + `+ Add Day`).
- **Two-Layer Plan Alternatives**:
  - **Whole-Day Variants (`DayOption`)**: Compare `Plan A` vs. `Plan B (Rainy)` on the same day without duplicating dates.
  - **Slot-Level Multi-Choice (`choice_group_id`)**: Keep multiple candidates for a single slot (e.g., 3 lunch options and 2 dinner options) with inline switching that dynamically updates map pins and route distance.
- **Split Transit Model & Smart Places**: Boarding-pass `FLIGHT` cards (auto Great-Circle distance & airport pin), `RESERVED_TRANSIT`, slim `LOCAL_TRANSIT` connectors, `STAY` cards with automatic cross-day basecamp inheritance on the map, `SPOT` & `FOOD` cards with **Google Places API (New)** search, safe Google Maps URL resolution, and one-tap local-language name copy (`local_name`).
- **Interactive Maps & Privacy-First Sharing**: Lazy-loaded **MapLibre GL JS** (mobile `[ List | Map ]` toggle + collapsible desktop split view) and read-only share links (`/s/:token`) with backend-enforced privacy policies.
- **Zero-Friction Expenses & Travel Stats**: Per-trip multi-currency expense ledger + annual/lifetime stats (international trip detection, countries visited, travel days, distance flown & ground distance without double-counting backup options).
- **Agent-Native MCP Server (`packages/mcp`)**: 17 FastMCP tools + `SKILL.md` powered by scoped Personal API Tokens (`tp_pat_*`) so AI agents can ingest Gmail bookings, build Plan B backups, and log expenses.

## Monorepo Architecture

```text
trip-pilot/
├── apps/
│   ├── web/          # Angular 22 PWA (Standalone, Signals, NgRx SignalStore, MapLibre GL, i18n en/zh-TW)
│   └── api/          # FastAPI + SQLAlchemy 2.x (async) + Alembic (SQLite locally, PostgreSQL/Supabase prod)
├── packages/
│   └── mcp/          # FastMCP Server (`tripilot-mcp`) + Agent `SKILL.md`
├── docs/
│   └── DEPLOY.md     # Firebase Hosting + Google Cloud Run + Supabase deployment guide
└── docker-compose.yaml
```

## Quick Start (Docker)

1. Copy `.env.example` to `.env` (optionally add `GOOGLE_PLACES_API_KEY`):
   ```bash
   cp .env.example .env
   ```
2. Launch both containers with live hot reload:
   ```bash
   docker compose up --build
   ```
3. Open:
   - **Web App**: `http://localhost:4200`
   - **API Swagger Docs**: `http://localhost:8000/api/v1/docs`

## Testing

```bash
# Backend (FastAPI)
docker run --rm -v "$PWD/apps/api:/app" tripilot-api:dev sh -c "ruff check . && pytest -q -p no:cacheprovider"

# Frontend (Angular 22 + Vitest)
docker run --rm -v "$PWD/apps/web:/app" -v /app/node_modules tripilot-web:dev sh -c "npx ng test --watch=false && npm run build"

# MCP Server
docker run --rm -v "$PWD/packages/mcp:/mcp" -w /mcp tripilot-api:dev sh -c "ruff check . && PYTHONPATH=. pytest -q -p no:cacheprovider"
```

## Cloud Deployment

See [docs/DEPLOY.md](docs/DEPLOY.md) for deploying to **Firebase Hosting + Google Cloud Run + Supabase PostgreSQL** (including shared `DB_SCHEMA` isolation and Transaction Pooler port `6543`).
