# Patronus Frontend — Complete Design and Logic Reference

> **Purpose:** This document is the canonical specification for the Patronus frontend.
> It is written so that a developer (or AI agent) can reproduce the entire UI exactly on any platform —
> React Native, Android, iOS, or web — without access to the source code.

---

## 1. Technology Stack

| Concern | Choice | Notes |
|---|---|---|
| Framework | React 19 (Vite) | JSX, hooks, no class components |
| Map | react-leaflet 5 + Leaflet 1.9 | OpenStreetMap tiles |
| Routing | OSRM public server | `router.project-osrm.org` |
| Icons | lucide-react | Feather-style, SVG stroke icons |
| CSS | Plain CSS (App.css + index.css) | No CSS-in-JS, no Tailwind |
| State | React `useState` / `useRef` / `useMemo` | No Redux, no context |
| Data | REST polling + no WebSocket on frontend | Backend serves `/api/*` |

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

### Tab accent colours (one per tab)

| Tab | Icon color `--c` | Background `--bg` |
|---|---|---|
| Fuel | `#f59e0b` | `#fef3c7` |
| Engine | `#ef4444` | `#fee2e2` |
| Trip | `#3b82f6` | `#dbeafe` |
| Performance | `#8b5cf6` | `#ede9fe` |
| GPS | `#10b981` | `#d1fae5` |
| Sensors | `#06b6d4` | `#cffafe` |

### Typography

- Base font: system font stack (inherited from browser)
- Header title: `1.3rem`, weight 600, letter-spacing 1px
- KPI card label: `0.72rem`, color `#888`
- KPI card value: `1.3rem`, weight 600
- Stat box label: `0.66rem`, uppercase, letter-spacing 0.4px, color `#9099b8`
- Stat box value: `1.35rem`, weight 700
- Gauge label: `0.68rem`, color `#aaa`

---

## 3. App Structure and View Router

The app has **three top-level views**, controlled by `view` state in `App.jsx`.

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
| `keyMap` | `{ [id]: string }` | Maps KPI key → human label, from `/api/keys` |
| `tabMap` | `{ [id]: string }` | Maps KPI key → tab name, from `/api/keys` |
| `kpiMeta` | `KpiMeta` | Units, short/full names extracted from history records |
| `profileData` | `{ field, value }[]` | Vehicle profile fields from history |
| `selectedKpi` | `string \| null` | If set, shows KpiDetail for that key |
| `view` | `'live' \| 'replay'` | Current top-level view |
| `loading` | `boolean` | Initial load guard |
| `lastRefresh` | `Date` | When the last `/api/obd2/history` call completed |

### Initial data fetch

On mount, App fetches both endpoints in parallel:

```
GET /api/obd2/history  → OBD2Record[]  (limit 100, sorted newest first)
GET /api/keys          → KeyEntry[]    (id, DeviceID, tab)
```

After both resolve:
1. Derive `kpiMeta` by scanning all history records for meta-prefixed KPI keys
2. Derive `profileData` by scanning for `profile*`-prefixed KPI keys
3. Build `keyMap`: `{ [entry.id]: entry.DeviceID }`
4. Build `tabMap`: `{ [entry.id]: entry.tab }` (only entries that have `tab`)

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

**Key schema rules:**
- Each element in `kpis` is a single-key object `{ key: value }` where value is always a string
- Keys starting with `defaultUnit`, `userUnit`, `userShortName`, `userFullName` are **metadata**, not sensor readings
- Keys starting with `profile` are **vehicle profile** data
- All other keys are **sensor KPI values** (e.g. `kd`, `kff1006`, `kc`)
- The `k` prefix on sensor keys is the Torque app convention (e.g. `kd` = OBD PID 0x0D = vehicle speed)

### KeyEntry (from `/api/keys`)

```json
{
  "id": "kff1006",
  "DeviceID": "GPS Latitude",
  "tab": "gps"
}
```

---

## 5. Utility Functions (`utils.js`)

These are pure functions. Rebuild them identically on any platform.

### `extractKpiMap(record) → { [key]: string }`

Reads `record.kpis` array, skips meta-prefixed keys, returns a flat `{key: value}` map for the sensor readings in that single record.

Meta prefixes to skip: `defaultUnit`, `userUnit`, `userShortName`, `userFullName`, `profile`

### `getTopKpis(history) → { key, value, receivedAt }[]`

Iterates history (newest first), collects the **first occurrence** of each KPI key. Result is the most-recent value for every key seen across all 100 records. This is the primary input for the live view KPI grid.

### `getKpiMeta(history) → KpiMeta`

Scans all records, collects meta values:
- `defaultUnit{sensorId}` → `defaultUnits[sensorId]`
- `userUnit{sensorId}` → `userUnits[sensorId]`
- `userShortName{sensorId}` → `shortNames[sensorId]`
- `userFullName{sensorId}` → `fullNames[sensorId]`

First occurrence wins (records are newest-first, so newest metadata wins).

### `getKpiLabel(kpiKey, kpiMeta, keyMap) → string`

Label resolution priority:
1. `kpiMeta.shortNames[sensorId]` — strip leading `k` from key to get sensorId
2. `kpiMeta.fullNames[sensorId]`
3. `keyMap[kpiKey]` (from data.json lookup)
4. Raw `kpiKey` as fallback

For array values (multiple ECU responses), skip entries starting with `ECU(` and take the first clean one.

### `getKpiUnit(kpiKey, kpiMeta) → string`

Unit priority: `userUnits[sensorId]` → `defaultUnits[sensorId]` → `''`

### `getProfileData(history) → { field, value }[]`

Scans history for `profile`-prefixed KPI keys. Strips the prefix to get the field name. First occurrence wins. Returns array of `{ field, value }`.

### `getBreadcrumb(history) → [lat, lng][]`

History is reversed to oldest-first. Takes every 10th record, extracts `kff1006` (lat) and `kff1005` (lng). Only pushes if both are valid floats. Returns max ~10 points for 100 records.

### `getPathPoints(records) → [lat, lng][]`

Like getBreadcrumb but for replay: takes an ordered (oldest-first) slice of records. Sampling step = `max(1, floor(records.length / 150))` to cap at 150 points.

### `getKpiHistory(history, kpiKey) → { value, receivedAt }[]`

Returns all readings for a single key across all history records, oldest-first. Used by KpiDetail.

---

## 6. Live View (`LandingPage`)

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│ APP HEADER (dark navy bar)                                  │
│  "Patronus — Live Telemetry"  │ Refreshed  Last data  🔖 🚗 ⏪│
├──────────────────────────┬──────────────────────────────────┤
│                          │ KPI SECTION                      │
│                          │  ┌─ HERO (gauges + stat tiles) ─┐│
│  MAP SECTION (40% width) │  │ Speed  RPM  HP  Torque        ││
│                          │  │        Load  LoadAbs          ││
│  [Leaflet map]           │  └───────────────────────────────┘│
│                          │  ┌───┬──────────────────────────┐│
│                          │  │ T │                          ││
│                          │  │ A │  KPI CARD GRID           ││
│                          │  │ B │  (filtered by active tab)││
│                          │  │ S │                          ││
│                          │  └───┴──────────────────────────┘│
└──────────────────────────┴──────────────────────────────────┘
```

- Map section: fixed `40%` width, full height
- KPI section: fills remaining `60%`, `flex-direction: column`
- On mobile (≤768px): stacks vertically, map gets fixed 280px height

### Auto-refresh

`setInterval(fetchData, 10000)` — polls `/api/obd2/history` every 10 seconds. The interval is set up in `useEffect` inside LandingPage and cleared on unmount.

### Header buttons

| Button | Icon | State | Action |
|---|---|---|---|
| Units & Names | `BookOpen` | Disabled | (future feature) |
| Vehicle Profile | `Car` | Disabled | (future feature) |
| Replay | `Rewind` solid white on red bg | Active | Sets `view = 'replay'` |

---

## 7. KPI Hero Section (`KpiHero.jsx`)

Always visible at the top of the KPI section. Shows the most critical metrics prominently regardless of which tab is active.

### Layout: 3-column grid

```
[ Speed Gauge ] [ RPM Gauge ] [ HP    | Torque  ]
                              [ Load  | Load Abs ]
```

### Arc Gauge (speed and RPM)

A 270° SVG arc gauge. Implementation:

```
viewBox: "0 0 100 88"
Center: (50, 56)
Radius: 36
Start angle: 135° (7-o'clock, measuring from positive x-axis clockwise in SVG)
Sweep: 270°

Track path: arcPath(cx, cy, r, 135, 270) — light gray #ebebeb, strokeWidth 9
Value path: arcPath(cx, cy, r, 135, pct * 270) — colored fill, strokeWidth 9
Both use strokeLinecap="round"

arcPath formula:
  startX = cx + r * cos(toRad(startDeg))
  startY = cy + r * sin(toRad(startDeg))
  endX = cx + r * cos(toRad(startDeg + sweepDeg))
  endY = cy + r * sin(toRad(startDeg + sweepDeg))
  largeArcFlag = sweepDeg > 180 ? 1 : 0
  path = "M {startX} {startY} A {r} {r} 0 {largeArcFlag} 1 {endX} {endY}"
```

**Speed gauge:** key `kd`, max 200, unit `km/h`, color `#3498db`
**RPM gauge:** key `kc`, max 8000, unit `RPM`, color `#e67e22`

Values are rounded to whole integers.

### Stat Tiles (2×2 grid)

| Tile | Key | Unit |
|---|---|---|
| Horsepower | `kff1226` | hp |
| Torque | `kff1225` | Nm |
| Engine Load | `k4` | % |
| Load (Abs) | `k43` | % |

**Sticky behavior:** `KpiHero` maintains a `lastSeen` ref (not state — no re-render). On each render:
1. Any fresh numeric value for the tracked keys is absorbed into `lastSeen`
2. `resolve(key)` checks: fresh value in `kvm` → show in normal dark text
3. If missing from `kvm` but in `lastSeen` → show `lastSeen` value in light gray (`#ccc`) — **stale**
4. Never seen → show `—`

This means tiles never flash to zero or `—` when a frame doesn't contain a particular KPI.

---

## 8. KPI Tab Bar

A vertical strip of 6 icon-only buttons on the left edge of the KPI body area.

### Tab definitions (in order)

| Tab key | Label | Icon | Accent color |
|---|---|---|---|
| `fuel` | Fuel | `Droplet` | `#f59e0b` on `#fef3c7` |
| `engine` | Engine | `Cpu` | `#ef4444` on `#fee2e2` |
| `trip` | Trip | `Navigation` | `#3b82f6` on `#dbeafe` |
| `performance` | Perf | `Zap` | `#8b5cf6` on `#ede9fe` |
| `gps` | GPS | `MapPin` | `#10b981` on `#d1fae5` |
| `sensors` | Sensors | `Activity` | `#06b6d4` on `#cffafe` |

### Tab button states

- **Default:** icon `#d0d0d0`, no background
- **Hover:** icon in `--c`, background `--bg`, scale transform `1.25×`, tooltip label fades in to the right
- **Active:** icon in `--c`, background `--bg`, `box-shadow: inset -2px 0 0 var(--c)` (right-edge accent bar)

### Tooltip

CSS `::after` pseudo-element. `content: attr(data-label)` reads the label text from the `data-label` attribute on the button. Appears to the right (`left: calc(100% + 10px)`), centered vertically. Dark navy pill, fades in on hover.

### Tab filtering

`topKpis.filter(({ key }) => tabMap[key] === activeTab)`

If the filtered array is empty, show: `"No {tabLabel} data in current session."` in italic gray.

### Tab assignments in data.json

The `tab` field on each data.json entry drives which tab a KPI appears in. Assignment summary:

- **fuel**: Fuel trims, fuel pressure, fuel level, economy (MPG/KPL/L100km), CO₂, flow rates, distance to empty, fuel remaining, ethanol
- **engine**: RPM, OBD speed, engine load, coolant temp, oil temp, intake temps, MAF, manifold pressure, catalyst temps, exhaust temps, timing advance, voltages, transmission temps, volumetric efficiency, run time
- **trip**: Trip distance, trip times (total/moving/stationary), trip avg speeds, trip avg economy, trip costs, MIL distance, codes-cleared distance
- **performance**: HP, torque, engine kW, turbo boost/vacuum, all 0-60/0-100/quarter-mile/acceleration/braking times
- **gps**: GPS lat/lng, speed (GPS), altitude, heading, bearing, GPS accuracy, satellite count, GPS vs OBD speed delta
- **sensors**: All O2 sensors (equivalence ratios, voltages, wide-range), AFR measured/commanded, throttle positions, pedal positions, EGR, barometric pressure, accelerometers X/Y/Z/total, tilt X/Y/Z, air status, commanded lambda

---

## 9. KPI Card

Each KPI card is a clickable tile in the grid.

```
┌─────────────────────────┐
│ GPS Latitude        0.7rem gray label, truncated with ellipsis
│ 22.673 °            1.3rem bold value + unit suffix
└─────────────────────────┘
```

- Grid: `repeat(auto-fill, minmax(180px, 1fr))`, gap 12px
- Hover: `box-shadow: 0 4px 12px rgba(0,0,0,0.12)`, `translateY(-2px)`
- Value formatting: `parseFloat(value).toFixed(3)` if numeric; raw string otherwise
- Clicking a card in the live view opens `KpiDetail` for that key

---

## 10. KPI Detail View (`KpiDetail`)

Full-page replacement for the live view. Shows a time-series table for one KPI.

- Header: same navy bar, "Patronus — Live Telemetry"
- Back button: returns to live view
- Refresh button: re-fetches history
- Title: resolved label + unit in parentheses
- Sub-title: raw key string (e.g. `kff1006`)
- Table: `#`, `Value`, `Time` columns
  - # = 1-indexed row number
  - Value = formatted with 3dp + unit
  - Time = `new Date(receivedAt).toLocaleString()`
- Data source: `getKpiHistory(history, kpiKey)` — all occurrences, oldest first

---

## 11. Map (`MapView`)

### Structure

```
<div class="map-wrapper">            ← position:relative, fills parent
  <MapContainer />                   ← Leaflet map, fills wrapper
    <TileLayer />                    ← OpenStreetMap tiles
    <MapController />                ← Camera logic (no render)
    <Polyline />                     ← Route path
    <CircleMarker × n />             ← GPS pins
  <Compass />                        ← SVG overlay, bottom-left, z-index 1001
  <div class="map-mode-toggle" />   ← Toggle buttons, top-right, z-index 1001
```

### Camera modes

Controlled by `mode` state: `'route'` (default) or `'track'`.

**Full Route mode:** On every `points` change, `map.fitBounds(points, { padding: [32, 32] })`. Always shows all points. Zoom resets to fit.

**Track mode:** On every `points` change, `map.panTo(points[points.length - 1])`. Only pans; user's zoom level is never modified.

Toggle buttons: pill-style overlay, top-right of map. "Full Route" | "Track", active state = navy background.

### Route rendering

- `points` = raw GPS `[lat, lng][]` (from getBreadcrumb or getPathPoints)
- `useRoutedPath(points)` → `{ routed, loading }`
- Display path: `routed.length > 0 ? routed : points`
- Polyline: color `#7c3aed` (purple), weight 4, opacity 0.9 (0.4 while loading)

### OSRM road snapping (`useRoutedPath`)

```
Endpoint: https://router.project-osrm.org/route/v1/driving/{coords}
          ?overview=full&geometries=geojson

Coords format: lng,lat;lng,lat;...   (OSRM is lng-first, Leaflet is lat-first)
Response: routes[0].geometry.coordinates → [[lng,lat], ...] → convert to [[lat,lng], ...]

Chunking: max 100 coords per request, chunks overlap by 1 point for stitching
Stitching: concat chunks, trim first point of each subsequent chunk

Debounce: 30 seconds from last points change
  - First load (routed.length === 0 or points reset to []): fires IMMEDIATELY (delay = 0)
  - Subsequent changes: 30 second debounce
  - points reset to []: clears hasRouted flag so next non-empty fires immediately

Cancellation: AbortController per request
  - New debounce timer cancels previous AbortController
  - AbortError → keep existing route (no flash to straight lines)
  - Other error → setLoading(false), keep existing route
```

### GPS pins

- All history breadcrumb points rendered as `CircleMarker`
- Last point (most recent): radius 7, color `#e74c3c` (red)
- All other points: radius 4, color `#3498db` (blue)

### Compass overlay

Position: `bottom: 28px, left: 10px`, `pointer-events: none`

SVG compass (72×72):
- Outer circle: white fill, 1.5px border, drop shadow
- Cardinal ticks: 4 lines at N/S/E/W positions
- Cardinal labels: N (bold), S, E, W
- Needle group rotated by `heading` degrees:
  - North half (red `#e74c3c`): triangle pointing up
  - South half (gray `#bbb`): triangle pointing down
- Center dot: `#333`, radius 3.5
- Degree label below circle: `{Math.round(heading)}°`

Heading source:
- Live view: `parseFloat(extractKpiMap(history[0])['kff1007']) || 0`
- Replay: `parseFloat(extractKpiMap(currentRecord)['kff1007']) || 0`

Key `kff1007` = Heading (GPS), 0–360°, 0 = North.

---

## 12. Replay View (`ReplayPage`)

### Layout

```
┌────────────────────────────────────────────────────────────┐
│ APP HEADER  "Patronus — Replay"  │ 🔖 🚗 📻(back to live)  │
├────────────────────────────────────────────────────────────┤
│ TRIP SELECTOR bar                                          │
├────────────────────────────────────────────────────────────┤
│ REPLAY HEADER (trip stats + current frame info)            │
├────────────────────────────────────────────────────────────┤
│ REPLAY CONTROLS (play/pause, scrubber, speed)              │
├──────────────────────────┬─────────────────────────────────┤
│  MAP                     │  KPI SECTION                    │
│  (same as live)          │  (hero + tab bar + grid)        │
└──────────────────────────┴─────────────────────────────────┘
```

### Trip selection modes

**Trips mode** (default):
- Date range pickers (From / To), defaulting to last 7 days
- Calls `GET /api/trips?start=...&end=...`
- Returns array of detected trips (see server-side trip detection)
- Each trip displayed as a chip: date, start time, duration, record count
- Selecting a chip sets `selectedTrip` which drives `source`

**Custom Range mode:**
- `datetime-local` inputs for start and end
- "Load" button commits the range to `activeCustom`
- Source becomes `{ start: activeCustom.start, end: activeCustom.end }`

### Data streaming (`useReplayStream`)

```
source: { start: ISO string, end: ISO string } | null

On source change:
  1. Reset records=[], total=0, frame=0, playing=false
  2. Fetch first page: GET /api/obd2/history/paged?start=&end=&offset=0&limit=100
  3. Store records, set total from response

Pre-fetch trigger:
  When records.length - frame <= 25 AND nextOffset < total
  → fetch next page, append to records

Play timer:
  setInterval(600ms / speed) → advance frame by 1
  If frame would exceed records.length → stall (wait for pre-fetch)
  If frame >= records.length - 1 AND nextOffset >= total → auto-stop

Seek: clamp to [0, records.length - 1]

Speed multipliers: 1×, 2×, 5×, 10×, 20×
```

### Replay Header stats

Shown as labelled stat chips in a horizontal bar:
- Date (trip start date)
- Start time
- End time
- Duration (Xh Ym or Ym Ys)
- Record count
- Frame counter (current / total)
- Current frame time
- Elapsed since trip start

### Replay Controls

- **Play/Pause button:** circle button, `#1a1a2e`. Shows ▶, ⏸, ↺ (at end), or `…` (buffering frame 0)
- **Scrubber:** `<input type="range">` min=0, max=total-1, value=frame. `accent-color: #1a1a2e`
- **Frame counter:** `{frame+1} / {total}`
- **Buffering indicator:** pulsing "buffering…" text in `#e67e22`
- **Speed buttons:** 1× 2× 5× 10× 20×. Active = navy bg, white text

### Map in replay

`mapPoints = getPathPoints(records.slice(0, frame + 1))`

This grows the path as the frame advances — shows the trip being drawn in real time.

Compass heading updates per frame from `currentRecord.kpis['kff1007']`.

---

## 13. Server API Reference

All routes are prefixed `/api`.

### `GET /api/obd2/history`

Returns: `OBD2Record[]` — latest 100 records, sorted `receivedAt` descending.

### `GET /api/obd2/history/paged`

Params: `start`, `end` (ISO strings), `offset` (int), `limit` (int, max 500)
Returns: `{ records: OBD2Record[], total: int, offset: int, limit: int }`

Records sorted `receivedAt` ascending (oldest first). Used exclusively by replay streaming.

### `GET /api/trips`

Params: `start`, `end` (ISO strings, default last 7 days)
Returns: `Trip[]`

Trip detection algorithm (server-side):
1. Fetch all `receivedAt` timestamps in the date range, sorted ascending
2. Walk records; if gap between consecutive records > 3 hours → new trip
3. Each trip: `{ tripId, startTime, endTime, recordCount, durationMs }`
4. Returned newest first (`trips.reverse()`)
5. `tripId` = `'trip_' + index` after reverse (positional, not durable)

### `GET /api/keys`

Returns: `{ id, DeviceID, tab? }[]` — the full data.json contents.

### `GET /api/obd2` (write path, used by mobile app)

Receives telemetry as query parameters. Broadcasts to WebSocket subscribers. Persists to MongoDB if the request comes from an allowed Android user-agent (Samsung SM- devices).

---

## 14. KPI Key Reference (critical keys)

| Key | Sensor | Tab | Notes |
|---|---|---|---|
| `kd` | Speed (OBD) | engine | km/h, integer in hero |
| `kc` | Engine RPM | engine | integer in hero |
| `k4` | Engine Load | engine | % |
| `k43` | Engine Load (Abs) | engine | % |
| `kff1226` | Horsepower | performance | hp, integer in hero |
| `kff1225` | Torque | performance | Nm, integer in hero |
| `kff1006` | GPS Latitude | gps | used for map pins and breadcrumb |
| `kff1005` | GPS Longitude | gps | used for map pins and breadcrumb |
| `kff1007` | Heading (GPS) | gps | 0–360°, drives compass needle |
| `kff1001` | Speed (GPS) | gps | km/h |
| `kff1010` | GPS Altitude | gps | metres |

All values arrive as **strings** from the OBD adapter. Always `parseFloat()` before numeric use.

---

## 15. Component Dependency Tree

```
App
├── LandingPage
│   ├── MapView
│   │   └── useRoutedPath (hook)
│   ├── KpiHero
│   ├── KpiCard
│   │   └── FormattedValue
│   └── InfoModal (Units & Names, Profile — currently disabled)
├── ReplayPage
│   ├── TripSelector
│   │   ├── TripsMode
│   │   └── CustomRangeMode
│   ├── ReplayHeader
│   ├── ReplayControls
│   ├── MapView
│   │   └── useRoutedPath (hook)
│   ├── KpiHero
│   ├── KpiCard
│   │   └── FormattedValue
│   └── InfoModal (disabled)
└── KpiDetail
    └── FormattedValue

Hooks
├── useReplayStream   ← paged streaming + pre-fetch + play timer
├── useTrips          ← trip list fetch with date range state
├── useRoutedPath     ← OSRM snapping with debounce + abort
└── useReplay         ← (legacy simple replay, superseded by useReplayStream)
```

---

## 16. Critical Implementation Rules

1. **Values are always strings.** Never assume numeric type from the database.
2. **KPI keys are lowercase hex-ish strings.** `kd`, `kc`, `kff1006` etc. Case-sensitive.
3. **History is newest-first.** Reverse before displaying time-series oldest-to-newest.
4. **`receivedAt` is the canonical timestamp** — not the `time` field from the OBD device (which is a Unix ms string and may be unreliable).
5. **Tab filtering uses `tabMap[key] === activeTab`.** If `tabMap` is empty (backend not restarted after data.json change), all tabs appear empty. Restart the backend.
6. **OSRM coords are lng,lat; Leaflet is lat,lng.** Always swap when converting between the two.
7. **`useRoutedPath` fires immediately on first non-empty points**, then debounces 30s. Do not call OSRM on every poll.
8. **Sticky hero tiles** use a ref, not state. The component renders with the last known value grayed out if the current frame/poll doesn't contain that key.
9. **Trip IDs are positional** (`trip_0` = newest trip). They change if new trips are added. Do not persist them.
10. **The `session` field in OBD records** is a number set by the Android app to group records into a logical trip. It is separate from the server-detected `tripId`.
