# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Inherited rules

Hierarchy: global [~/.claude/CLAUDE.md](C:/Users/sahil/.claude/CLAUDE.md) (always active) → this file → in-session instructions. This file only adds to global. The standard rule files (from `I:\jsdev1\claude-portable\rules\`) sit beside it in `.claude/`. Like the other repos they are **not `@`-imported**: open the one whose topic comes up.

| Topic | Rule file |
|---|---|
| Working model, CRM callouts, self-review, violation logging | `pm-pf-crm.md`, `process-rules.md` |
| TS conventions (apply to any new TS) | `typescript-standards.md` |
| PII, secrets, input validation | `security-rules.md` |
| Express routes and controllers, response shapes | `backend-patterns.md`, `api-conventions.md` |
| Mongoose schemas and queries | `mongodb-conventions.md` |
| React/Vite frontend | `frontend-rules.md` |

**Legacy exception.** The code predates these rules. It is plain JS, has no response envelope, and the models use no soft delete. Apply the rules to new code and don't retrofit existing code. The Mongo ingest write logic stays frozen (see Project rules). The frontend uses plain CSS with no MUI or Redux, so the MUI/Redux sections of `frontend-rules.md` don't apply; [docs/03](../docs/03-frontend-design-and-logic.md) governs the frontend.

Standard artefacts: [violation-log.md](violation-log.md) and [docs/AI_CHANGELOG.md](../docs/AI_CHANGELOG.md). Every code-changing session appends an AI changelog entry. `.env.example` holds the placeholders.

## Commands

Run from the repo root unless noted.

- `npm run dev:fs` — API (`node index`) and Vite dev server together. Vite proxies `/api` to `localhost:$PORT`, read from the root `.env`.
- `npm start` — API only. `PORT` has no default in `index.js`, so it must be set in `.env`.
- `npm run build` — installs and builds the frontend into `./public`. Express serves that directory and falls back to `index.html`. `public/` is gitignored.
- `npm test` — `node --test` (built-in runner, tests in `test/`). Single file: `node --test test/engineWatch.test.js`.
- `npm --prefix frontend run lint` — ESLint for the frontend. The backend has no linter.

Env vars: `MONGO_URI`, `MONGO_DB_NAME` (default `patronus_research`), `PORT`, `WEBSOCKET_ENABLED` (`false` disables the WS server and broadcasts), `NTFY_TOPIC`, `NTFY_DISABLED` (`true` turns off push alerts). `.env` is gitignored. Railway deploys via `railway.toml` (build, then `npm start`).

## Architecture

Two parts in one repo: a plain-JS CommonJS Express backend (root) and a React 19 + Vite + Leaflet PWA ([frontend/](../frontend/)). The frontend polls REST and does not use WebSocket.

**Ingest paths** ([index.js](../index.js)). Two independent producers write into MongoDB:
1. `GET /api/obd2` — the Android OBD app sends telemetry as query params. The handler broadcasts it over WS (`/wsinit`), records it in `engineWatch`, and calls `persistObd2Query`. That function filters by user-agent (Android `SM-*` devices only) and requires `eml`, `session` and `id`. It writes an `Obd2Event` and calls `persistObd` in [extGpsController.js](../extGpsController.js). The HTTP response is sent without waiting for persistence.
2. `POST /api/telemetry/gps-event` — a separate external GPS source. Fixes are upserted into the `obdWithExtGps` collection by `(sync_ts, email)`, where `sync_ts` comes from [utils/tsSync.js](../utils/tsSync.js). The OBD path writes to the same collection, so OBD and ext-GPS records are joined by timestamp bucket.

**Read paths**: `/api/obd2/history[/paged]`, `/api/obd2/ext-history[/paged]` and `/api/trips`. Automatic trips are not stored: `groupTrips` in [persistence/tripGrouping.js](../persistence/tripGrouping.js) derives them from `receivedAt` gaps over 24 hours (shorter silences are breaks within one trip). **Saved trips** (collection `savedtrips`, model [savedTrip.js](../persistence/models/savedTrip.js)) are hand-defined ranges that claim their records first and are always listed; they are created with the interactive, temporary [scripts/saved-trips.js](../scripts/saved-trips.js). `/api/trips/saved/:id` and `/api/obd2/timeline` serve shared replay links and the replay header's day/trip-time stats. Paged endpoints cap `limit` at 500 and feed the replay sliding window.

**engineWatch** ([engineWatch.js](../engineWatch.js)) is an observe-only monitor. It records what the ingest handlers did, evaluates "something broke mid-drive" rules every minute, and pushes state changes to a **public** ntfy topic. It must never throw into the request path (everything goes through `safe()`), change what gets written, or send coordinates, emails, session ids or raw DB errors. `/api/health` serves liveness from process memory only, with no DB query.

**Mongo connection** ([persistence/mongoose.js](../persistence/mongoose.js)) is a lazy memoised `connect()`. It resets on failure so the next call retries. Every persistence function awaits it.

**Frontend**: the app is `App.jsx` plus `components/` and `hooks/` (`useGpsEvaluator`, `useReplay*`, `useTrips`, `useExtGpsToggle`). It chooses between OBD GPS and external GPS, and routes the path through the public OSRM server.

## Docs

[docs/03-frontend-design-and-logic.md](../docs/03-frontend-design-and-logic.md) is the canonical, current frontend spec. **[docs/01](../docs/01-code-and-flow.md) and [docs/02](../docs/02-logical-design-and-business-logic.md) are stale.** They describe the original thin WebSocket relay (three routes, no persistence, no Mongo) and predate persistence, ext GPS, trips and engineWatch. Trust the code over them.

## Project rules

- **Mongo ingest write logic is frozen.** Don't change the ingest writes (the bucket-overwrite issue is parked) without explicit approval.
- **DB access only through `mongodb-mcp-server`, and ask first.** Never write throwaway scripts that read `.env` to query Mongo. The one exception is `scripts/saved-trips.js`, which the user asked for and runs themselves: Claude must not run it against the real database.
- **"One by one" or "go through the findings" means discuss.** Make no edits until the user approves each item.
- **If behind `origin`, branch and commit, then merge `origin/master` in.** Keep manual GPS overrides.
- **Violations caught by the user are logged** in [violation-log.md](violation-log.md), including the session stats table.
- Backend code is plain JS with `var`/`function` and no types. Follow the surrounding style when editing it. The global fat-arrow and TypeScript rules apply to new TS code.
