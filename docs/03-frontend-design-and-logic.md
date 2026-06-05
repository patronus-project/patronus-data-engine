# Patronus Frontend — Complete Design and Logic Reference

> **Purpose:** This document is the canonical specification for the Patronus frontend.
> It is written so that a developer (or AI agent) can reproduce the entire UI exactly on any platform —
> React Native, Android, iOS, or web — without access to the source code.

---

## 1. Technology Stack

| Concern | Choice | Notes |
|---|---|---|
| Framework | React 19 (Vite 8) | JSX, hooks, no class components |
| Map | react-leaflet 5 + Leaflet 1.9 | OpenStreetMap tiles |
| Road routing | OSRM public server | `router.project-osrm.org` |
| Icons | lucide-react | Feather-style SVG stroke icons |
| CSS | Plain CSS (`App.css`) | No CSS-in-JS, no Tailwind |
| State | React `useState` / `useRef` / `useMemo` | No Redux, no context |
| Data | REST polling — no WebSocket on the frontend | Backend serves `/api/*` |
| PWA | vite-plugin-pwa (Workbox) | Service worker, manifest, offline asset cache |

---

## 2. Design Tokens

### Colours

| Token | Value | Used for |
|---|---|---|
| `--navy` | `#1a1a2e` | App header bg, active states, text headings |
| `--red` | `#e74c3c` | Map markers (latest pin), accent |
| `--blue` | `#3498db` | Map markers (history pins) |
| `--purple` | `#7c3aed` | Route polyline |
| `--border` | `#e0e0e0` | Card borders, dividers |
| `--bg-subtle` | `#f5f6fa` | Stat box backgrounds |
| `--text-label` | `#888` | KPI card labels, secondary text |
| `--text-main` | `#1a1a2e` | Primary values |
| `--ext-red` | `#c0392b` | Ext GPS active badge/toast |
| `--obd-green` | `#1a5e30` | OBD GPS active badge/toast |

### Alert colours

| Level | Border / value | Background | Label colour |
|---|---|---|---|
| Amber | `#f59e0b` | `#fef3c7` | `#78350f` |
| Red | `#ef4444` | `#fee2e2` | `#7f1d1d` |

### Tab accent colours

| Tab | Icon `--c` | Background `--bg` |
|---|---|---|
| Fuel | `#f59e0b` | `#fef3c7` |
| Engine | `#ef4444` | `#fee2e2` |
| Trip | `#3b82f6` | `#dbeafe` |
| Performance | `#8b5cf6` | `#ede9fe` |
| GPS | `#10b981` | `#d1fae5` |
| Sensors | `#06b6d4` | `#cffafe` |
| Misc | `#6b7280` | `#f3f4f6` |
| Ext GPS | *(inherits)* | *(inherits)* |

### Typography

- Base font: system font stack (inherited from browser)
- Header title: `1.3rem`, weight 600, letter-spacing 1px
- KPI card label: `0.72rem`, color `#888`
- KPI card value: `1.3rem`, weight 600
- Alert card value: `1.5rem`, weight 700, vivid alert colour
- Stat box label: `0.66rem`, uppercase, letter-spacing 0.4px, color `#9099b8`
- Stat box value: `1.35rem`, weight 700
- Gauge label: `0.68rem`, color `#aaa`

---

## 3. App Structure and View Router

Three top-level views controlled by `view` state in `App.jsx`:

```
App
 ├─ view === 'live'   → LandingPage
 ├─ view === 'replay' → ReplayPage
 └─ selectedKpi set   → KpiDetail  (overrides live view)
```

### App-level state

| State | Type | Description |
|---|---|---|
| `history` | `OBD2Record[]` | Latest 100 records from `/api/obd2/history`, newest first |
| `extHistory` | `ObdWithExtGps[]` | Latest 100 joined GPS docs from `/api/obd2/ext-history` |
| `extMap` | `Map<sync_ts, doc>` | Built from `extHistory` via `buildExtMap()` |
| `keyMap` | `{ [id]: string }` | Maps KPI key → human label, from `/api/keys` |
| `tabMap` | `{ [id]: string }` | Maps KPI key → tab name, from `/api/keys` |
| `staticUnitMap` | `{ [id]: string }` | Maps KPI key → static unit string, from `/api/keys` |
| `alertMap` | `{ [id]: AlertConfig }` | Maps KPI key → alert thresholds, from `/api/keys` |
| `kpiMeta` | `KpiMeta` | Dynamic units/names extracted from history OBD metadata keys |
| `profileData` | `{ field, value }[]` | Vehicle profile fields from history |
| `selectedKpi` | `string \| null` | If set, shows KpiDetail for that key |
| `view` | `'live' \| 'replay'` | Current top-level view |
| `loading` | `boolean` | Initial load guard |
| `lastRefresh` | `Date` | Timestamp of last successful history fetch |
| `forceObd` | `boolean` | From `useExtGpsToggle` — if true, ignores evaluator and uses OBD GPS |
| `evaluator` | `{ source, reason }` | Output of `useGpsEvaluator` running every 30s |
| `activeSource` | `'torque' \| 'ext'` | `forceObd ? 'torque' : evaluator.source` |
| `gpsWarning` | `string \| null` | Warning when active stream is frozen |

### Initial data fetch

On mount, fetches all three endpoints in parallel:

```
GET /api/obd2/history      → OBD2Record[]
GET /api/keys              → KeyEntry[]
GET /api/obd2/ext-history  → ObdWithExtGps[]
```

After all resolve, builds maps from `KeyEntry[]` and `extMap` from ext-history via `buildExtMap()`.

---

## 4. Data Model

### OBD2Record (from `/api/obd2/history`)

```json
{
  "_id": "mongo ObjectId string",
  "email": "user@example.com",
  "v": "9",
  "session": "1234567890",
  "id": "0",
  "time": "1748876523000",
  "kpis": [
    { "kff1006": "22.693" },
    { "kff1005": "88.348" },
    { "kd": "32.0" },
    { "kc": "1450.0" },
    { "userShortNameff1006": "Lat" },
    { "defaultUnitff1005": "°" },
    { "profileMake": "Toyota" }
  ],
  "receivedAt": "2025-06-02T14:12:03.000Z"
}
```

### ObdWithExtGps (from `/api/obd2/ext-history`)

```json
{
  "sync_ts": 1748876520000,
  "email": "user@example.com",
  "session": "1234567890",
  "kpis": [ ... ],
  "extGps": {
    "lat": "22.6728674",
    "lon": "88.3484902",
    "acc": "41.8",
    "spd": "0.0",
    "alt": "-31.4",
    "dir": "0.0",
    "sat": "0",
    "prov": "network",
    "hdop": "",
    "pdop": "",
    "act": "",
    "aid": "4b7256249870dda2"
  },
  "obdReceivedAt": "2025-06-02T14:12:00.000Z",
  "gpsReceivedAt": "2025-06-02T14:12:01.000Z"
}
```

`sync_ts` is a 10-second bucket: `Math.floor(ms / 10000) * 10000`. Both OBD and GPS events within the same 10s window share the same document.

### KeyEntry (from `/api/keys`)

```json
{
  "id": "kd",
  "DeviceID": "Speed (OBD)",
  "tab": "engine",
  "unit": "km/h",
  "alerts": { "amber": 81, "red": 101, "dir": "gte" }
}
```

---

## 5. Utility Functions (`utils.js`)

All pure functions. Rebuild identically on any platform.

### Unit Parser Registry

```js
const UNIT_PARSERS = {
  'G': raw => {
    const n = parseFloat(raw)
    return isNaN(n)
      ? { value: raw, unit: 'G' }
      : { value: (n / 100).toFixed(3), unit: 'G' }
  },
}
```

### `parseUnit(unit, rawValue) → { value, unit }`

Looks up `unit` in `UNIT_PARSERS`. Falls through to raw value if no parser.

### `getAlertLevel(kpiKey, rawValue, alertMap) → 'red' | 'amber' | null`

```
cfg = alertMap[kpiKey]
if no cfg → null
v = parseFloat(rawValue) — if NaN → null
dir !== 'lte': v >= cfg.red → 'red', v >= cfg.amber → 'amber'
dir === 'lte': v <= cfg.red → 'red', v <= cfg.amber → 'amber'
```

### `extractKpiMap(record) → { [key]: string }`

Reads `record.kpis`, skips meta-prefixed keys, returns flat sensor map.
Meta prefixes: `defaultUnit`, `userUnit`, `userShortName`, `userFullName`, `profile`

### `getTopKpis(history) → { key, value, receivedAt }[]`

Newest-first scan; first occurrence of each key wins. Most-recent value per sensor.

### `getKpiMeta(history) → KpiMeta`

Scans all records for dynamic metadata keys. First occurrence wins per sensor.

### `getKpiLabel(kpiKey, kpiMeta, keyMap) → string`

Priority: `shortNames[id]` → `fullNames[id]` → `keyMap[kpiKey]` → raw key.

### `getKpiUnit(kpiKey, kpiMeta, staticUnitMap) → string`

Priority: `userUnits[id]` → `defaultUnits[id]` → `staticUnitMap[kpiKey]` → `''`

### `getProfileData(history) → { field, value }[]`

Scans for `profile`-prefixed KPI keys. Strips prefix, first occurrence wins.

### `getBreadcrumb(history) → [lat, lng][]`

Torque GPS breadcrumb. Reverses history, every 10th record → `[kff1006, kff1005]`.

### `getExtBreadcrumb(history, extMap) → [lat, lng][]`

Ext GPS breadcrumb. Reverses history, every 10th record → resolves `extMap.get(getExtSyncTs(record.time))?.extGps?.{lat, lon}`.

### `getPathPoints(records) → [lat, lng][]`

Torque GPS path for replay. Samples `records` with step `max(1, floor(len/150))`.

### `getExtPathPoints(records, extMap) → [lat, lng][]`

Ext GPS path for replay. Same sampling, resolves lat/lon from `extMap` via `getExtSyncTs`.

### `buildExtMap(extRecords) → Map<sync_ts, doc>`

Converts ext-history array into a `Map` keyed by `sync_ts`. Guards against non-array input.

### `getExtSyncTs(time) → number | null`

Floors a record's `time` string to 10s bucket: `Math.floor(Number(time) / 10000) * 10000`.
Returns `null` for falsy/NaN input.

### `getKpiHistory(history, kpiKey) → { value, receivedAt }[]`

All readings for one key, oldest-first. Used by KpiDetail.

---

## 6. Alert System

### data.json alert config

```json
"alerts": { "amber": 81, "red": 101, "dir": "gte" }
```

- `dir: "gte"` (default) — high-direction: speed, temp, RPM
- `dir: "lte"` — low-direction: fuel level, battery, range

---

## 7. GPS Source Evaluation (`useGpsEvaluator`)

Runs every 30 seconds. Evaluates which GPS stream (Torque OBD vs External mendhak) is more trustworthy. Reads data via refs so the interval never restarts on prop changes.

### Input

- `records` — latest OBD history
- `extMap` — Map of sync_ts → ObdWithExtGps doc

### Phase 1 — Stagnation Filter

Considers only records where `obdSpeed > 5 km/h` (ignores stopped/creeping traffic).
Counts consecutive identical coordinates for each stream while the vehicle is moving.
If one stream has `staleCount >= 3` and the other does not → immediately declare the non-frozen stream the winner.

### Phase 2 — Variance Math

If neither stream is frozen:
- `torqueDelta[i] = obdSpeed - torqueSpeed` (from `kff1001`)
- `extDelta[i]    = obdSpeed - extSpeed`    (`extGps.spd × 3.6`, m/s→km/h)

Compute `stdDev()` for both delta arrays.

### Phase 3 — Decision

Lower standard deviation = tracking reality more accurately = winner.
Tie (both equal, e.g. car stopped at red) → retain current source (no unnecessary swap).

### Output

```js
{ source: 'torque' | 'ext', reason: 'torque-frozen' | 'ext-frozen' | 'lower-variance' | 'tie' | 'no-data' | 'init' }
```

### Constants (in `useGpsEvaluator.js`)

| Constant | Value | Purpose |
|---|---|---|
| `OBD_SPEED_KEY` | `'k0d'` | OBD vehicle speed (km/h) |
| `TORQUE_LAT_KEY` | `'kff1006'` | Torque GPS latitude |
| `TORQUE_LON_KEY` | `'kff1005'` | Torque GPS longitude |
| `TORQUE_SPD_KEY` | `'kff1001'` | Torque GPS speed — verify against PIDs |
| `STALE_THRESHOLD` | `3` | Consecutive frozen coords = stream is stale |
| `MOVING_KMH` | `5` | Ignore records below this speed |
| `WINDOW_MS` | `30000` | Only evaluate last 30s of records |
| `EVAL_INTERVAL_MS` | `30000` | Re-run every 30s |

---

## 8. OBD GPS Override Toggle (`useExtGpsToggle`)

Persists to `localStorage` key `patronus_obd_override`.

| State | Meaning |
|---|---|
| `forceObd = false` (default) | Evaluator decides which GPS source to use |
| `forceObd = true` | Always use OBD/Torque GPS regardless of evaluator |

```js
const activeSource = forceObd ? 'torque' : evaluator.source
```

`displayedSource` accounts for data availability: if `activeSource === 'ext'` but ext has no path points → fall back to OBD, `displayedSource = 'obd'`.

### GPS Warning Banner

Shown below the app header when the active stream is frozen:

| Condition | Warning |
|---|---|
| `forceObd && evaluator.reason === 'torque-frozen'` | "OBD GPS is frozen — consider disabling the OBD override" |
| `!forceObd && evaluator.reason === 'ext-frozen'` | "Ext GPS is frozen — switching to OBD GPS" |

### Toggle Button

Orange satellite icon (`Satellite`, lucide) in the header. Orange (`#e67e22`) when `forceObd` is active.

---

## 9. Live View (`LandingPage`)

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│ APP HEADER (navy)                                            │
│  "Patronus — Live Telemetry"   Refreshed  Last data  🔖 🚗 📡 ⏪ │
├──────────────────────────────────────────────────────────────┤
│ [GPS WARNING BANNER — amber, only when frozen]               │
├─────────────────────┬────────────────────────────────────────┤
│                     │ KPI SECTION (flex column)              │
│  MAP SECTION        │  ┌── HERO (hero-pad, 20px h-padding) ─┐│
│  (40% width)        │  │ [Speed] [RPM] [HP][Torque]         ││
│  position:relative  │  │             [Load][Load Abs]        ││
│                     │  └────────────────────────────────────┘│
│  [Leaflet map]      │  ┌─────────────────────────────────────┤│
│  [Compass BL]       │  │ Tab │  KPI Grid (filtered by tab)  ││
│  [Mode toggle TR]   │  │ Bar │                              ││
│  [Source badge BR]  │  └─────────────────────────────────────┘│
└─────────────────────┴────────────────────────────────────────┘
```

### Auto-refresh

`setInterval(fetchData, 10000)` in `useEffect`. Cleared on unmount.

### Header buttons

| Button | Icon | State | Action |
|---|---|---|---|
| Units & Names | `BookOpen` | Disabled | — |
| Vehicle Profile | `Car` | Disabled | — |
| OBD Override | `Satellite` | Orange when active | Toggle `forceObd` |
| Replay | `Rewind` (red bg) | Active | `setView('replay')` |

### Map source resolution

```js
const extBreadcrumb   = getExtBreadcrumb(history, extMap)
const obdBreadcrumb   = getBreadcrumb(history)
const breadcrumb      = activeSource === 'ext' && extBreadcrumb.length > 0 ? extBreadcrumb : obdBreadcrumb
const displayedSource = activeSource === 'ext' && extBreadcrumb.length > 0 ? 'ext' : 'obd'
```

### Heading source

```js
if (displayedSource === 'ext') → extMap.get(syncTs)?.extGps?.dir
else                           → extractKpiMap(history[0])['kff1007']
```

### Map source badge

Absolutely positioned chip, `bottom: 15px, right: 10px`, inside `.map-section` (`position: relative`).

| `displayedSource` | Text | Background |
|---|---|---|
| `ext` | "Ext GPS" | `#c0392b` (solid red) |
| `obd` | "OBD GPS" | `#1a5e30` (solid dark green) |

---

## 10. KPI Hero Section (`KpiHero.jsx`)

*(Unchanged — see previous version)*

---

## 11. KPI Tab Bar

A vertical strip of icon-only buttons on the left edge of `.kpi-body`.

### Tab definitions (in display order)

| Tab key | Label | Icon (lucide) |
|---|---|---|
| `fuel` | Fuel | `Droplet` |
| `engine` | Engine | `Cpu` |
| `trip` | Trip | `Navigation` |
| `performance` | Perf | `Zap` |
| `gps` | GPS | `MapPin` |
| `sensors` | Sensors | `Activity` |
| `misc` | Unknown | `CircleHelp` |
| `extgps` | Ext | `Satellite` |

### Filtering logic

```js
// Named tabs (fuel, engine, …, gps, sensors)
topKpis.filter(({ key }) => tabMap[key] === activeTab)

// Misc tab — keys with no tab assignment in data.json
topKpis.filter(({ key }) => !tabMap[key])

// Ext tab — renders extGpsEntries from extMap, NOT kpis
Object.entries(extDoc.extGps).filter(([k]) => k !== 'ts')
```

**Important:** Ext GPS keys in `data.json` (`lat`, `lon`, `acc`, etc.) have **no `tab` field** intentionally. This prevents them from polluting `tabMap`, which would cause those keys to vanish from the Misc tab when they also appear in OBD kpis.

### Active source toasts

| Tab active | `displayedSource` | Toast |
|---|---|---|
| `gps` | `ext` | Red toast: "Ext GPS Active" |
| `extgps` | `obd` | Green toast: "OBD GPS Active" |

Toast is rendered at the top of `.kpi-grid-area` before the KPI cards.

---

## 12. KPI Card

*(Unchanged — see previous version)*

---

## 13. KPI Detail View (`KpiDetail`)

*(Unchanged — see previous version)*

---

## 14. Map (`MapView`)

*(Structure and camera modes unchanged)*

### GPS source badge

`.map-source-badge` — `position: absolute`, `bottom: 15px`, `right: 10px`, `z-index: 1000`, `pointer-events: none`.
Fully opaque. Updates live as `displayedSource` changes.

### Heading source

Live: ext `dir` field (degrees) when ext active, else `kff1007`.
Replay: same — `displayedSource` resolved first, then heading.

---

## 15. Replay View (`ReplayPage`)

### Ext GPS in replay

On `source` change, fetches ext history for the trip's time range:
```
GET /api/obd2/ext-history/paged?start=&end=&limit=500
```

Builds `extMap` from result. No evaluator runs — replay uses toggle state from localStorage directly.

### Map source resolution (replay)

```js
if (!forceObd) {
  extPoints = getExtPathPoints(slice, extMap)
  if (extPoints.length > 0) → use extPoints
}
→ fallback: getPathPoints(slice)
```

`displayedSource` recomputes on each frame. Heading uses `extGps.dir` when ext active.

### Header buttons (replay)

Same as live view: `Satellite` toggle for OBD override (shares localStorage).

---

## 16. PWA Configuration

*(Unchanged — see previous version)*

---

## 17. Server API Reference

All routes prefixed `/api`.

### `GET /api/obd2/history`
Returns: `OBD2Record[]` — latest 100, `receivedAt` descending.

### `GET /api/obd2/history/paged`
Params: `start`, `end` (ISO), `offset`, `limit` (max 500)
Returns: `{ records, total, offset, limit }` — ascending.

### `GET /api/obd2/ext-history`
Returns: `ObdWithExtGps[]` — latest 100 joined docs, `obdReceivedAt` descending.

### `GET /api/obd2/ext-history/paged`
Params: `start`, `end` (ISO), `offset`, `limit` (max 500)
Returns: `{ records, total, offset, limit }` — `obdReceivedAt` ascending.

### `GET /api/trips`
Params: `start`, `end` (ISO, defaults: last 7 days)
Returns: `Trip[]` — newest first. 3-hour gap = new trip.

### `GET /api/keys`
Returns full `data.json`.

### `POST /api/telemetry/gps-event`
Body: mendhak GPS Logger payload (`lat`, `lon`, `acc`, `ts`, `spd`, `alt`, `dir`, `act`, `prov`, `aid`, `sat`, `hdop`, `pdop`, `email`)
Rejects if `acc > 50` or missing `lat`/`lon`/`ts`.
Upserts into `ObdWithExtGps` by `{ sync_ts, email }`.

---

## 18. KPI Key Reference

*(OBD keys unchanged — see previous version)*

### Ext GPS keys (from mendhak GPS Logger, in `data.json`)

These appear in the **Ext tab** only. No `tab` field set — excluded from `tabMap`.

| Key | Label | Unit |
|---|---|---|
| `lat` | Latitude | ° |
| `lon` | Longitude | ° |
| `alt` | Altitude | m |
| `acc` | Accuracy | m |
| `spd` | Speed (GPS) | m/s |
| `dir` | Bearing | ° |
| `sat` | Satellite Count | — |
| `prov` | Location Provider | — |
| `hdop` | Horizontal Dilution of Precision | — |
| `pdop` | Position Dilution of Precision | — |
| `act` | Detected Activity | — |
| `aid` | Android Device ID | — |

`spd` is in **m/s** from mendhak. Multiply by 3.6 for km/h (done in evaluator; displayed raw in Ext tab).

---

## 19. Component Dependency Tree

```
App
├── useGpsEvaluator (hook) — 30s interval, GPS source decision
├── useExtGpsToggle (hook) — localStorage OBD override toggle
├── LandingPage
│   ├── MapView → useRoutedPath
│   │   └── .map-source-badge (GPS source chip, BR)
│   ├── KpiHero
│   ├── KpiCard → FormattedValue → parseUnit()
│   └── InfoModal (disabled)
├── ReplayPage
│   ├── useExtGpsToggle (hook) — shared localStorage key
│   ├── TripSelector
│   ├── ReplayHeader
│   ├── ReplayControls
│   ├── MapView → useRoutedPath
│   │   └── .map-source-badge (GPS source chip, BR)
│   ├── KpiHero
│   └── KpiCard → FormattedValue → parseUnit()
└── KpiDetail → FormattedValue

Hooks
├── useReplayStream     paged streaming, pre-fetch, play timer
├── useTrips            trip list fetch with date range state
├── useRoutedPath       OSRM debounce + AbortController
├── useGpsEvaluator     30s GPS source evaluator (live view only)
└── useExtGpsToggle     localStorage OBD override (both views)
```

---

## 20. Critical Implementation Rules

1. **Values are always strings.** Never assume numeric type from MongoDB.
2. **KPI keys are lowercase hex-ish strings** (`kd`, `kc`, `kff1006`). Case-sensitive.
3. **History is newest-first.** Reverse before rendering time-series charts.
4. **`receivedAt` is the canonical timestamp** — not the `time` field.
5. **Tab filtering:** `tabMap[key] === activeTab` for named tabs; `!tabMap[key]` for Misc.
6. **Ext GPS keys must NOT have a `tab` field** in data.json — they appear in OBD kpis too (e.g. `lat`, `lon`), and a `tab` value would hide them from Misc.
7. **OSRM coords are lng,lat; Leaflet is lat,lng.** Always swap at the API boundary.
8. **`useRoutedPath` fires immediately on first non-empty points** then debounces 30s.
9. **AbortController cancels in-flight OSRM requests.** AbortError → keep existing route.
10. **Sticky hero tiles use a ref, not state.**
11. **Alert specificity rule:** `.kpi-card.kpi-alert-{level} .kpi-value` (0-3-0) beats mobile overrides.
12. **G-force unit parser:** raw ÷ 100. Register as `UNIT_PARSERS['G']`.
13. **Trip IDs are positional** — never persist them.
14. **PWA install requires HTTPS.** LAN IP will not trigger the install prompt.
15. **index.html must never be cached.** Serve with `Cache-Control: no-store`.
16. **`buildExtMap` guards against non-array input** — API errors return `{}`, not `[]`. Always check `Array.isArray` before iterating.
17. **`getExtSyncTs` returns `null` for falsy/NaN input.** Always null-check before Map lookup.
18. **Ext GPS `spd` is m/s.** Multiply by 3.6 for km/h comparison. Display raw in Ext tab.
19. **`displayedSource` is not the same as `activeSource`.** `activeSource` is the evaluator/toggle decision; `displayedSource` accounts for data availability and may fall back to OBD even when ext is preferred.
20. **Heading uses ext `dir` only when `displayedSource === 'ext'`.** Computed after `displayedSource` — order of hook declarations matters.
