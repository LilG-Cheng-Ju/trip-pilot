# Tripilot

**Mobile-First, Agent-Native Travel Itinerary Platform.**

Tripilot pairs a calm, editorial mobile PWA (see [DESIGN.md](DESIGN.md) and [`tokens.css`](apps/web/src/styles/tokens.css)) with a structured travel data model and first-class Remote & Local MCP integration.

## Highlights

- **Multi-Trip Overview**: Manage domestic and international trips across `Upcoming` and `Completed` tabs with searchable multi-country selection (50+ countries), 180-day departure countdowns, and flexible return dates (`End Date`, `Trip Length`, or `Decide Later` + `+ Add Day`).
- **Two-Layer Plan Alternatives**:
  - **Whole-Day Variants (`DayOption`)**: Clean single-plan view by default; add `Plan B` from blank or cloned from the current plan, rename any plan inline, and safely delete backups (guarded so the last remaining plan cannot be removed).
  - **Slot-Level Multi-Choice (`choice_group_id`)**: Keep multiple candidates for a single slot with 0ms optimistic switching that updates map pins and route distance.
- **Split Transit Model & Smart Places**: Boarding-pass `FLIGHT` cards (auto Great-Circle distance & airport pin), `RESERVED_TRANSIT`, slim `LOCAL_TRANSIT` connectors, `STAY` cards with automatic cross-day basecamp inheritance on the map, `SPOT` & `FOOD` cards with **Google Places API (New)** search, safe Google Maps URL resolution, editable route/address field, cloud attachment links, and one-tap local-language name copy (`local_name`).
- **Interactive Maps & Privacy-First Sharing**: Lazy-loaded **MapLibre GL JS** with semantic pin colors synced 1:1 with card dots, always-on desktop split view, mobile thumb-zone bottom sheet + floating preview card, and read-only share links (`/s/:token`) with backend-enforced privacy policies.
- **Zero-Friction Expenses & Travel Stats**: 1-tap quick expense logging with live cached FX rates, multi-currency totals, and annual/lifetime travel dashboard (`All | Domestic | International`) without double-counting backup options.
- **Agent-Native Remote & Local MCP**: In-process Streamable HTTP MCP endpoint (`POST /mcp`) + public `/llms.txt` + local FastMCP server (`packages/mcp`) and `SKILL.md`, all authenticated via scoped Personal API Tokens (`tp_pat_*`).

## Monorepo Architecture

```text
trip-pilot/
├── apps/
│   ├── web/          # Angular 22 PWA (Standalone, Signals, NgRx SignalStore, MapLibre GL, i18n en/zh-TW)
│   └── api/          # FastAPI + SQLAlchemy 2.x (async) + Alembic + Remote /mcp & /llms.txt
├── packages/
│   └── mcp/          # Local FastMCP Server (`tripilot-mcp`) + Agent `SKILL.md`
├── docs/
│   └── DEPLOY.md     # Firebase Hosting + Google Cloud Run + Supabase deployment guide
├── DESIGN.md         # Editorial Travel & Precision Aviation design system
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
