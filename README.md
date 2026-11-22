# Tripilot

**Mobile-First, Agent-Native Travel Itinerary Platform.**

Tripilot combines a calm, one-handed mobile PWA experience (Deep Navy & Warm Champagne Gold) with a structured travel data model supporting per-day Plan A / Plan B variants, split transit items, cached OSRM road distances, actual expense tracking, annual travel statistics, and first-class Antigravity / Gemini MCP integration.

## Architecture

- `apps/web` — Angular (latest stable, standalone, Signals, NgRx SignalStore, PWA, MapLibre GL JS, bilingual `en` / `zh-TW`)
- `apps/api` — FastAPI + SQLAlchemy 2.x (async) + Alembic (SQLite locally, PostgreSQL/Supabase-ready)
- `packages/mcp` — Lightweight FastMCP server + `SKILL.md` for AI agent workflows
- `docker-compose.yaml` — Multi-stage Docker setup (`web` + `api`)

## Quick Start

Copy `.env.example` to `.env` and follow the service READMEs once Phase 1 & Phase 2 are scaffolded.
