---
name: tripilot-release
description: >-
  Runbook for bumping Tripilot versions and cutting releases. Use whenever updating
  the app version, shipping new features/APIs/MCP tools, updating release notes,
  syncing CHANGELOG.md and frontend What's New, or syncing Tripilot skills.
---

# Tripilot Release & Version-Bump Checklist

Follow this checklist whenever bumping the Tripilot version (e.g. `0.8.4-beta` -> `0.8.5-beta` or `0.9.0-beta`).

## 1. Sync Version Strings Across the Monorepo

Update all version files to the new target version (`X.Y.Z-beta` for app/web, `X.Y.Z` for Python packages):

- `apps/web/src/app/core/config/app-version.ts` (`APP_VERSION`)
- `apps/web/package.json` and `apps/web/package-lock.json` (root `version` and `packages[""].version`)
- `apps/api/app/core/config.py` (`app_version`)
- `apps/api/pyproject.toml` -> run `uv lock` inside `apps/api`
- `packages/mcp/pyproject.toml` and `packages/mcp/tripilot_mcp/__init__.py` -> run `uv lock` inside `packages/mcp`

## 2. Update User-Facing Release Notes (Single Source of Truth)

- Prepend a new entry to root `releases.json` (`version`, `date`, bilingual `title` and `changes` for `zh-TW` and `en`).
- **Writing style**:
  - Keep every bullet **factual, direct, and engineer-style** (2-3 bullets per release): state what was added, changed, or fixed without marketing adjectives (avoid words like 全新、全面升級、極致、流暢、安心、品牌).
  - Keep wording understandable to users without internal implementation jargon (no OSRM, WebGL, Alembic, Zoneless, SSRF, Streamable HTTP, etc.).
  - For backend-only or infrastructure releases, give a short high-level summary of the practical effect (stability, speed, access protection, AI tool alignment).
- Run `node scripts/sync-releases.mjs` to regenerate:
  - Root `CHANGELOG.md` (for Git / GitHub)
  - `apps/web/src/app/core/config/release-notes.generated.ts` (for the in-app release notes dialog)
- Verify sync and monorepo version alignment:
  ```bash
  node scripts/sync-releases.mjs --check
  ```

## 3. Sync API, MCP, and Skills (When Capabilities Changed)

If the release adds or modifies REST endpoints, itinerary/expense schemas, or MCP tools:

1. Verify 1:1 tool/parameter parity between `apps/api/app/api/v1/mcp.py` and `packages/mcp/tripilot_mcp/server.py`.
2. Update the public `/llms.txt` guide inside `apps/api/app/api/v1/mcp.py`.
3. Update `packages/mcp/SKILL.md` so AI assistants know the new workflows or parameters.
4. **Ask the user** before mirroring `packages/mcp/SKILL.md` into their personal `~/.gemini/config/skills/tripilot/SKILL.md` (and never auto-commit `~/.gemini/config/` without explicit confirmation).

## 4. Run Full Verification Before Committing

- Release consistency: `node scripts/sync-releases.mjs --check`
- Backend (`apps/api`): `ruff check .`, `mypy app tests`, `pytest -q`, and Alembic `alembic upgrade head` on a temp SQLite DB
- MCP (`packages/mcp`): `uv run --frozen --extra dev ruff check .`, `mypy tripilot_mcp tests`, `pytest -q`
- Frontend (`apps/web`): `npm run lint`, `npx ng test --watch=false`, `npm run build`

## 5. Commit, Push, and Tag Discipline

- Use Conventional Commits in English with the version in the summary, e.g. `feat(web): add in-app release notes and CHANGELOG sync (v0.8.4-beta)`.
- Never stage `.env`, `*.db`, `runtime-config.js`, `.venv/`, or `dist/`.
- Only create git tags (`git tag vX.Y.Z-beta`) or push to `origin` when the user explicitly requests it.
