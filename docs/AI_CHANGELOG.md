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

### 2026-10-08T03:00:00Z
**Prompt Summary:** Add a trip analytics object to the saved-trip record, computed in the background when a trip is added or at server start if missing, with a Trip Summary button on the replay page opening a multi-tab modal (impressive overview first, then plan, charts, route, timeline, engine and fuel) including a "plan the same trip" tab driven by the trip's own analytics.
**Type:** feature
**Risk:** medium
**Files:** persistence/analytics/* (new), persistence/tripAnalyticsRunner.js, persistence/models/savedTrip.js, persistence/obd2Persistence.js, persistence/tripGrouping.js, index.js, scripts/saved-trips.js, frontend/src/components/summary/* (new), frontend/src/hooks/{useTripAnalytics,useElementWidth}.js, frontend/src/components/{TripInfo,ReplayHeader,ReplayPage}.jsx, frontend/src/App.css, tests
**Notes:** Read path plus one new field set on savedtrips; ingest untouched. Compute is pure and tested with synthetic trips whose answers are known, and was checked on two real trips fetched read-only from the live API (254.8 km and 1327.8 km, matching the replay's own distance; a 45 L tank fitted on both). Real data forced several fixes before it was trusted: wheel time vs trip time (short breaks were inflating "time at the wheel"), net-drop tank fitting (summing gauge noise gave 31 L), sustained-rise fill-up detection (pumps raise the gauge gradually), and dropping the crow-flies card for round trips. Analytics are ~50 KB per trip and compute in ~0.2 s. Lists never carry the blob. IST and petrol are assumptions, documented in docs/03.
**Migration:** existing saved trips get analytics at the next server start (new fields default to null)
---

### 2026-10-08T04:00:00Z
**Prompt Summary:** The map compass was drawn on top of the Trip Summary modal; map overlays should only overlay the map.
**Type:** bugfix
**Risk:** low
**Files:** frontend/src/App.css
**Notes:** The compass and the Track/Full Route toggle use z-index 1001 (the GPS badge 1000) inside the page's root stacking context, because the map wrapper didn't create one, so they competed directly with the modal overlay (1000). `.map-wrapper` and `.map-section` now use `isolation: isolate`, so those z-indexes only apply inside the map. Verified by asking the browser what is topmost at each overlay's centre with the modal open: before, compass and toggle were on top (desktop and phone); after, all four map overlays are under the modal. (The toggle had the same bug; only the compass was reported.)
**Migration:** none
---

### 2026-10-08T06:00:00Z
**Prompt Summary:** Replay stalled after ~3000 points then jumped, worst at 10x/20x. Size the buffer by speed (about 20 s of lookahead), keep it rolling asynchronously, pause to build a buffer on speed changes. Make the trip picker collapsible and collapse it on play; on phones scroll to the map with some KPIs in view.
**Type:** bugfix
**Risk:** medium
**Files:** frontend/src/hooks/{useReplayStream,replayLoader,replayBuffer}.js, frontend/src/components/{ReplayPage,TripSelector}.jsx, frontend/src/App.css, tests
**Notes:** Root cause was two bugs. (1) Ext GPS was fetched by a separate one-at-a-time loop in ReplayPage that skipped itself when a request was in flight and was only retried when the OBD count changed, so at 10x/20x it fell behind; the frame and KPIs kept advancing on OBD alone while the map had no GPS for those frames, then the page landed and every dot appeared at once. (2) OBD was fetched in fixed 100-record pages, one at a time, only when 25 records were left: under a second of runway at 20x. A third latent bug: a far seek appended its page at the wrong index (non-contiguous buffer). Rebuilt as a framework-free loader (rolling lookahead of ~20 s of playback per speed, 3 parallel pages, in-order release, ext coverage by time) behind a thin hook; playback now advances only when both are loaded. Measured in headless Edge with ~0.5-2.4 s per request: a 68 s run at 20x did 33.3 frames/s (exact), zero stalls, zero dot bursts, 18 requests; 10x and 5x also zero stalls; speed changes while playing resume by themselves. Far seeks to frame 3000 take ~17 s on that deliberately slow backend (the loader is request-bound there). Phone focus-scroll waits for the KPI section to render, otherwise the browser clamps the scroll to the short page.
**Migration:** none
---

### 2026-10-08T08:00:00Z
**Prompt Summary:** Highway pace is 55 km/h for India, not 80; a consistent 100-120 km/h cruise or a rolling average of 85+ is an expressway. On phones put the map centre half way down the screen with the trip stats visible above it. CLI: regenerate one trip's analytics, or all of them, with confirmation.
**Type:** feature
**Risk:** low
**Files:** persistence/analytics/{constants,expressway,index,highlights,timeline,plan}.js, scripts/saved-trips.js, frontend/src/components/{ReplayPage}.jsx, frontend/src/components/summary/{OverviewTab,TimelineTab}.jsx, frontend/src/App.css, tests
**Notes:** Highway threshold 80 -> 55 (on the Kolkata trip highway share goes from 26% to 74% of moving time). New expressway section: a time-weighted rolling average of speed over a 5 minute window of 85 km/h or more, sections under 5 km dropped; reported as km, share, average pace, its own km/L, sections and longest, as a highlight card, timeline events, a plan figure and a tip. On the real trips: Kolkata 183.6 km in 5 sections (longest 108 km at 98 km/h average), 2 Oct 10 km. ANALYTICS_VERSION 3, so stored analytics regenerate at the next server start (or from the CLI, options 4 and 5). On phones the map centre now lands at 50% of the screen and the info block moves above the stats, so the live Progress group sits right above the map. The CLI's list returned whatever io.print returned for an empty list (it worked only because console.log returns undefined): it now returns an empty array.
**Migration:** none; existing saved trips regenerate analytics (version 3)
---

### 2026-10-08T09:00:00Z
**Prompt Summary:** The Highway driving KPI should be a share of the distance driven, not of moving time.
**Type:** bugfix
**Risk:** low
**Files:** persistence/analytics/{summary,index,highlights}.js, test/tripAnalytics.test.js, docs
**Notes:** summariseTime now also accumulates the distance driven at highway pace (55 km/h or more); the card is highwayKm over distanceKm, with the kilometres in its detail ("185 of 254 km driven at 55 km/h or more"). summary.highwayMs is kept. On the real trips: 2 Oct 74% (was 59% of time), Kolkata 85% (was 74%). ANALYTICS_VERSION 4, so stored analytics regenerate (server start, or the CLI). After Crawling traffic and After dark, which remain shares of moving time.
**Migration:** none; saved trips regenerate analytics (version 4)
---
