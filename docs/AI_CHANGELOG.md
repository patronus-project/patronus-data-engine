# AI Changelog

> Every session that produces code changes appends an entry here.
> **Copy this file to `docs/AI_CHANGELOG.md` in each new project.**

---

<!--
ENTRY FORMAT:

### YYYY-MM-DDTHH:MM:SSZ
**Prompt Summary:** [sanitised summary — what was asked, not implementation detail]
**Type:** feature | refactor | bugfix | performance | architecture | test | infra
**Risk:** low | medium | high
**Files:** [comma-separated list of files changed]
**Notes:** [reasoning for approach taken; tradeoffs; decisions made]
**Migration:** [API/DB/schema changes the team needs to know about, or "none"]
---

RISK GUIDE:
- low    — additive changes, no existing behaviour changed
- medium — changes existing behaviour, backwards-compatible
- high   — breaking changes, schema migrations, auth flow changes, security-sensitive

TYPE GUIDE:
- feature      — new capability added
- refactor     — restructuring without behaviour change
- bugfix        — fixing broken behaviour
- performance  — speed or resource optimisation
- architecture — structural or design decisions (may include code or docs only)
- test         — adding or modifying tests
- infra        — build, deploy, tooling, CI/CD, config
-->

### 2026-10-05T00:00:00Z
**Prompt Summary:** Trip gap was 3 h, which splits a drive at every rest stop; the UI already treats up to 4 h as a short break and up to 3 days as a long break. Make no data for 24 h the trip boundary.
**Type:** bugfix
**Risk:** medium
**Files:** persistence/obd2Persistence.js, docs/03-frontend-design-and-logic.md, .claude/CLAUDE.md
**Notes:** Read path only (detectTrips, derived per request, nothing stored), so no ingest or write logic is touched. Affects the web trip chips and the mobile Drives screen alike, and trip counts/boundaries change for existing data. Needs a deploy before the mobile app sees it.
**Migration:** none (trips are computed, not persisted; positional tripIds renumber)
---
