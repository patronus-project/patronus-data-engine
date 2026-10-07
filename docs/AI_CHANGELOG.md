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

### 2026-10-07T00:00:00Z
**Prompt Summary:** Replay page and home header were unusable on phones (and cramped on narrow desktops): toolbar controls and trip chips sat past the visible edge.
**Type:** bugfix
**Risk:** low
**Files:** frontend/src/App.css, docs/03-frontend-design-and-logic.md
**Notes:** CSS only, no JSX. Measured with headless Edge against the live API: home header was 520px in a 390px viewport, replay trip chips started at x=583, speed buttons clipped. Toolbars now wrap, trip selector stacks under 768px, page grows with content on phones. Verified no horizontal overflow at 360/390/768/1024/1366. Could not reproduce a desktop-specific break at 1366x768; narrow-desktop and short-window rules added defensively.
**Migration:** none
---

### 2026-10-08T00:00:00Z
**Prompt Summary:** Let trips be defined by hand (name, description, rough start/end), list them ahead of automatic grouping, make any trip a shareable replay link, and show saved-trip details plus day / trip time / last break / distance / progress in the replay header.
**Type:** feature
**Risk:** medium
**Files:** persistence/models/savedTrip.js, persistence/tripGrouping.js, persistence/obd2Persistence.js, index.js, scripts/saved-trips.js, frontend/src/components/{shareLink,tripDays,tripProgress}.js, frontend/src/components/{TripInfo,ReplayHeader,ReplayPage,TripSelector}.jsx, frontend/src/hooks/{useTripDays,useTripProgress,useTrips}.js, frontend/src/App.jsx, frontend/src/App.css, tests
**Notes:** New collection `savedtrips` (read path only; ingest writes untouched). Saved trips are always listed and are hard boundaries for automatic grouping; they snap to the first/last record inside the range entered. The CLI is interactive (range, record count, confirm, then name/description/tags) and its conversation is tested with scripted answers. Distance is speed x time (checked against GPS hops on three real drives, within ~3%). New endpoints: GET /api/trips/saved/:id, GET /api/obd2/timeline. Custom-range inputs are now converted to ISO in the browser zone (previously sent zone-less and read in the server's zone).
**Migration:** none (new collection created on first save)
---

### 2026-10-08T00:30:00Z
**Prompt Summary:** Replay map: Track mode with a rolling 600-point window synced to each data point, no line while playing, default for replay and live, not zoomed in so far.
**Type:** feature
**Risk:** low
**Files:** frontend/src/components/{MapView,LandingPage,ReplayPage}.jsx, frontend/src/components/utils.js, test/trackPoints.test.js
**Notes:** Full Route keeps its existing thinning. The old Track mode only panned, and the red marker was the last thinned point (up to ~28 frames behind the playhead late in a trip). Track dots are keyed by record index so a sliding window only touches its ends. OSRM snapping runs only in Full Route. Verified in headless Edge on the 8036-record Kolkata trip: 571 dots + 1 current at frame 800, no line while playing, line when paused, tile zoom 12.
**Migration:** none
---
