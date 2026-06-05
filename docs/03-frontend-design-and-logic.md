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

### Initial data fetch

On mount, fetches both endpoints in parallel:

```
GET /api/obd2/history  → OBD2Record[]
GET /api/keys          → KeyEntry[]
```

After both resolve, builds four maps from `KeyEntry[]`:
```js
keysData.forEach(k => {
  map[k.id]  = k.DeviceID          // keyMap
  if (k.tab)    tmap[k.id] = k.tab    // tabMap
  if (k.unit)   umap[k.id] = k.unit   // staticUnitMap
  if (k.alerts) amap[k.id] = k.alerts // alertMap
})
```

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
- Each element in `kpis` is a single-key object `{ key: value }` — value always a string
- Keys with prefixes `defaultUnit`, `userUnit`, `userShortName`, `userFullName` are **metadata**
- Keys with prefix `profile` are **vehicle profile** data
- All other keys are **sensor readings** (e.g. `kd` = OBD PID 0x0D = vehicle speed)
- The `k` prefix is Torque app convention

### KeyEntry (from `/api/keys`)

```json
{
  "id": "kd",
  "DeviceID": "Speed (OBD)",
  "tab": "engine",
  "unit": "km/h",
  "alerts": {
    "amber": 81,
    "red": 101,
    "dir": "gte"
  }
}
```

Fields:
- `id` — KPI key string (matches keys in OBD2Record.kpis)
- `DeviceID` — human-readable label
- `tab` — which tab this key appears in (`fuel | engine | trip | performance | gps | sensors`)
- `unit` *(optional)* — static unit string, used as fallback when OBD device sends no unit metadata
- `alerts` *(optional)* — alert threshold config (see Alert System section)

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

**Why G needs a parser:** Torque Pro encodes G-force as integer × 100 (100 = 1.00 G). So `100.688` → `1.007 G`. Add more parsers to `UNIT_PARSERS` as needed for other non-linear encodings.

### `parseUnit(unit, rawValue) → { value, unit }`

Looks up `unit` in `UNIT_PARSERS`. If a parser exists, calls it and returns the transformed result. If no parser, returns `{ value: rawValue, unit }` unchanged.

Called by `FormattedValue` before any display formatting.

### `getAlertLevel(kpiKey, rawValue, alertMap) → 'red' | 'amber' | null`

```
cfg = alertMap[kpiKey]
if no cfg → null
v = parseFloat(rawValue)
if isNaN(v) → null

if cfg.dir !== 'lte':          (default: gte)
  v >= cfg.red   → 'red'
  v >= cfg.amber → 'amber'
else:                          (lte: low-direction alerts)
  v <= cfg.red   → 'red'
  v <= cfg.amber → 'amber'

otherwise → null
```

### `extractKpiMap(record) → { [key]: string }`

Reads `record.kpis`, skips meta-prefixed keys, returns flat sensor map for one record.

Meta prefixes to skip: `defaultUnit`, `userUnit`, `userShortName`, `userFullName`, `profile`

### `getTopKpis(history) → { key, value, receivedAt }[]`

Iterates history (newest first), collects the **first occurrence** of each key. Result = most-recent value per key across all 100 records. Primary input for the live KPI grid.

### `getKpiMeta(history) → KpiMeta`

Scans all records for dynamic metadata keys. First occurrence wins.
- `defaultUnit{sensorId}` → `meta.defaultUnits[sensorId]`
- `userUnit{sensorId}` → `meta.userUnits[sensorId]`
- `userShortName{sensorId}` → `meta.shortNames[sensorId]`
- `userFullName{sensorId}` → `meta.fullNames[sensorId]`

### `getKpiLabel(kpiKey, kpiMeta, keyMap) → string`

Priority: `shortNames[id]` → `fullNames[id]` → `keyMap[kpiKey]` → raw key

For array values (multi-ECU): skip entries starting with `ECU(`, take first clean one.

### `getKpiUnit(kpiKey, kpiMeta, staticUnitMap) → string`

Priority: `userUnits[id]` (OBD device) → `defaultUnits[id]` (OBD device) → `staticUnitMap[kpiKey]` (data.json) → `''`

The `staticUnitMap` fallback ensures manually annotated units (e.g. `kPa` for exhaust pressure, `G` for G-force, `%` for battery) display correctly even when the OBD device sends no unit metadata.

### `getProfileData(history) → { field, value }[]`

Scans for `profile`-prefixed KPI keys. Strips prefix, first occurrence wins.

### `getBreadcrumb(history) → [lat, lng][]`

Reverses history to oldest-first. Every 10th record → `[kff1006, kff1005]`. Max ~10 points.

### `getPathPoints(records) → [lat, lng][]`

For replay: samples `records.slice(0, frame+1)` with step `max(1, floor(len/150))` to cap at 150 points.

### `getKpiHistory(history, kpiKey) → { value, receivedAt }[]`

All readings for one key, oldest-first. Used by KpiDetail.

---

## 6. Alert System

### data.json alert config

```json
"alerts": {
  "amber": 81,
  "red": 101,
  "dir": "gte"
}
```

- `dir: "gte"` (default) — alert fires when `value >= threshold` (high-direction: speed, temp, RPM)
- `dir: "lte"` — alert fires when `value <= threshold` (low-direction: fuel level, battery, range)

### Configured thresholds

| Key | Sensor | Amber | Red | Dir |
|---|---|---|---|---|
| `kd` | Speed (OBD) | 81 km/h | 101 km/h | gte |
| `kc` | Engine RPM | 3001 | 5001 | gte |
| `k5` | Coolant Temp | 95°C | 100°C | gte |
| `k5c` | Oil Temp | 100°C | 120°C | gte |
| `k4` | Engine Load | 80% | 95% | gte |
| `k2f` | Fuel Level | 20% | 10% | lte |
| `kff129a` | Device Battery | 30% | 15% | lte |
| `kff126a` | Distance to Empty | 400 km | 200 km | lte |

### Visual treatment on KPI cards

```
Normal card:
  border: 1px solid #e0e0e0
  background: #fff
  label: #888
  value: #1a1a2e, 1.3rem, weight 600

Amber card (.kpi-alert-amber):
  border: 2px solid #f59e0b, left: 5px solid #f59e0b
  background: #fef3c7
  label: #78350f, weight 700
  value: #f59e0b, 1.5rem, weight 700

Red card (.kpi-alert-red):
  border: 2px solid #ef4444, left: 5px solid #ef4444
  background: #fee2e2
  label: #7f1d1d, weight 700
  value: #ef4444, 1.5rem, weight 700
```

The left-edge accent bar (5px) is the primary visual signal. The thicker border, tinted background, and vivid value colour reinforce it. Use `.kpi-card.kpi-alert-{level}` selector (two classes on same element) to ensure specificity beats mobile overrides.

---

## 7. Live View (`LandingPage`)

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│ APP HEADER (navy)                                            │
│  "Patronus — Live Telemetry"   Refreshed  Last data  🔖 🚗 ⏪ │
├─────────────────────┬────────────────────────────────────────┤
│                     │ KPI SECTION (flex column)              │
│  MAP SECTION        │  ┌── HERO (hero-pad, 20px h-padding) ─┐│
│  (40% width)        │  │ [Speed] [RPM] [HP][Torque]         ││
│                     │  │             [Load][Load Abs]        ││
│  [Leaflet map]      │  └────────────────────────────────────┘│
│  [Compass BL]       │  ┌─────────────────────────────────────┤│
│  [Mode toggle TR]   │  │ Tab │  KPI Grid (filtered by tab)  ││
│                     │  │ Bar │                              ││
│                     │  └─────────────────────────────────────┘│
└─────────────────────┴────────────────────────────────────────┘
```

- Map: fixed 40% width, full height
- KPI section: flex column, overflow hidden; grid area scrolls independently
- Mobile (≤768px): stacks vertically, map 240px, tab bar stays vertical on left

### Auto-refresh

`setInterval(fetchData, 10000)` in `useEffect`. Cleared on unmount.

### Header buttons (icon-only, lucide-react)

| Button | Icon | State | Action |
|---|---|---|---|
| Units & Names | `BookOpen` | Disabled (future) | — |
| Vehicle Profile | `Car` | Disabled (future) | — |
| Replay | `Rewind` (solid white, red bg `#e74c3c`) | Active | `setView('replay')` |

---

## 8. KPI Hero Section (`KpiHero.jsx`)

Pinned above the tab bar. Always visible regardless of active tab.

### Layout: 3-column grid

```
[ Speed Gauge ] [ RPM Gauge ] [ HP    | Torque  ]
                              [ Load  | Load Abs ]
```

### Arc Gauge (SVG)

```
viewBox: "0 0 100 88"   Center: (50, 56)   Radius: 36
Start: 135°   Sweep: 270°   strokeWidth: 9   strokeLinecap: round

Track: arcPath(cx, cy, r, 135, 270)           → #ebebeb
Fill:  arcPath(cx, cy, r, 135, pct * 270)     → accent colour

arcPath(cx, cy, r, startDeg, sweepDeg):
  sx = cx + r·cos(toRad(startDeg))
  sy = cy + r·sin(toRad(startDeg))
  ex = cx + r·cos(toRad(startDeg + sweepDeg))
  ey = cy + r·sin(toRad(startDeg + sweepDeg))
  large = sweepDeg > 180 ? 1 : 0
  → "M {sx} {sy} A {r} {r} 0 {large} 1 {ex} {ey}"
```

| Gauge | Key | Max | Unit | Colour |
|---|---|---|---|---|
| Speed | `kd` | 200 | km/h | `#3498db` |
| RPM | `kc` | 8000 | RPM | `#e67e22` |

### Stat Tiles (2×2 grid, always all four)

| Tile | Key | Unit |
|---|---|---|
| Horsepower | `kff1226` | hp |
| Torque | `kff1225` | Nm |
| Engine Load | `k4` | % |
| Load (Abs) | `k43` | % |

### Sticky behavior

`KpiHero` holds a `lastSeen` ref (not state — no re-render triggered). On every render:
1. Any fresh numeric value for tracked keys updates `lastSeen`
2. `resolve(key)`: fresh → normal dark text | cached stale → `#ccc` light gray | never seen → `—`

This prevents tiles from flashing to zero/`—` when a frame or poll lacks a particular key.

---

## 9. KPI Tab Bar

A vertical strip of icon-only buttons on the left edge of `.kpi-body`.

### Tab definitions (in display order)

| Tab key | Label | Icon (lucide) | Accent `--c` / `--bg` |
|---|---|---|---|
| `fuel` | Fuel | `Droplet` | `#f59e0b` / `#fef3c7` |
| `engine` | Engine | `Cpu` | `#ef4444` / `#fee2e2` |
| `trip` | Trip | `Navigation` | `#3b82f6` / `#dbeafe` |
| `performance` | Perf | `Zap` | `#8b5cf6` / `#ede9fe` |
| `gps` | GPS | `MapPin` | `#10b981` / `#d1fae5` |
| `sensors` | Sensors | `Activity` | `#06b6d4` / `#cffafe` |
| `misc` | Unknown | `CircleHelp` | `#6b7280` / `#f3f4f6` |

### Filtering logic

```js
// All named tabs
topKpis.filter(({ key }) => tabMap[key] === activeTab)

// Misc tab — keys with no tab assignment
topKpis.filter(({ key }) => !tabMap[key])
```

If filtered result is empty: show `"No {label} data in current session."`.

### Button states

- **Default:** icon `#d0d0d0`, no background
- **Hover:** `background: var(--bg)`, `color: var(--c)`, `transform: scale(1.25)`, tooltip fades in
- **Active:** `background: var(--bg)`, `color: var(--c)`, `box-shadow: inset -2px 0 0 var(--c)`

### Tooltip

CSS `::after` with `content: attr(data-label)`. Appears to the right of the button (`left: calc(100% + 10px)`), vertically centered. Navy pill, opacity 0 → 1 on hover. Each button has `data-tab` (for CSS custom properties) and `data-label` (for tooltip content).

### Tab key assignments in data.json

- **fuel**: Fuel trims, fuel pressure, fuel level, economy (MPG/KPL/L100km), CO₂, flow rates, distance to empty, fuel remaining, ethanol %
- **engine**: RPM, OBD speed, engine load (×2), coolant/oil/intake temps, MAF, manifold pressure, catalyst/exhaust temps, timing advance, voltages, transmission temps, volumetric efficiency, run time
- **trip**: Trip distance, times (total/moving/stationary), avg speeds, avg economy, costs, MIL distance
- **performance**: HP, torque, engine kW, turbo boost/vacuum, all acceleration/braking split times
- **gps**: GPS lat/lng/altitude, speed (GPS), heading, bearing, accuracy, satellites, GPS vs OBD delta, device battery, G-force axes (X/Y/Z/total), GPS Altitude ALT
- **sensors**: All O2 sensors, AFR measured/commanded, throttle positions, pedal positions, EGR, barometric pressure, accelerometers, tilt, air status, commanded lambda
- **misc** *(implicit)*: any key not found in `tabMap` (not in data.json, or data.json entry has no `tab` field)

### New sensors added to data.json

| Key | Label | Tab | Unit |
|---|---|---|---|
| `k70` | GPS Altitude ALT | gps | m |
| `k73` | Exhaust Pressure | engine | kPa |
| `kff129a` | Device Battery Level | gps | % |
| `kff12a4` | G-Force X (Lateral) | gps | G |
| `kff12a5` | G-Force Y (Vertical/Gravity) | gps | G |
| `kff12a6` | G-Force Z (Accel/Brake) | gps | G |
| `kff12ab` | G-Force Total (Vector Sum) | gps | G |

**G-Force encoding:** Torque Pro sends G-force × 100. `kff12a5 = 100.688` means `1.007 G`. The `G` unit parser in `UNIT_PARSERS` handles this division automatically. The `staticUnitMap` ensures `G` is used even when the OBD device doesn't send `defaultUnit` metadata.

---

## 10. KPI Card

```
┌─────────────────────────┐
│ GPS Latitude        0.72rem #888 label, ellipsis overflow
│ 22.673 °            1.3rem weight 600 value + unit suffix
└─────────────────────────┘
```

- Grid: `repeat(auto-fill, minmax(180px, 1fr))`, gap 12px
- Hover: `box-shadow: 0 4px 12px rgba(0,0,0,0.12)`, `translateY(-2px)`
- Alert state: class `kpi-alert-amber` or `kpi-alert-red` added to root div
- Clicking in live view → opens KpiDetail

### Value formatting (`FormattedValue.jsx`)

1. `parseUnit(unit, rawValue)` → `{ value: parsed, unit: displayUnit }`
2. `parseFloat(parsed).toFixed(3)` if numeric; raw string otherwise
3. Renders: `{formatted}<span class="kpi-unit"> {displayUnit}</span>`

---

## 11. KPI Detail View (`KpiDetail`)

Full-page view replacing live view. Time-series table for one KPI.

- Title: resolved label + `(unit)`
- Sub-title: raw key string
- Table: `#`, `Value` (3dp + unit), `Time` (`toLocaleString()`)
- Data: `getKpiHistory(history, kpiKey)` — all occurrences, oldest-first

---

## 12. Map (`MapView`)

### Structure

```
<div class="map-wrapper">           position:relative, fills parent
  <MapContainer>                    Leaflet, fills wrapper
    <TileLayer>                     OpenStreetMap tiles
    <MapController>                 Camera logic (no DOM output)
    <Polyline>                      Road-snapped route, #7c3aed, weight 4
    <CircleMarker × n>              GPS breadcrumb pins
  <Compass>                         SVG overlay, bottom-left, z-index 1001
  <div.map-mode-toggle>             Full Route | Track, top-right, z-index 1001
```

### Camera modes (`MapController`)

| Mode | Behaviour on each `points` change |
|---|---|
| `route` (default) | `map.fitBounds(points, { padding: [32,32] })` — always shows full route |
| `track` | `map.panTo(points[last])` — pans only, never changes zoom |

### Route rendering

- Raw points → `useRoutedPath(points)` → road-snapped `routed`
- Display: `routed.length > 0 ? routed : points` (straight lines until OSRM responds)
- Polyline: `color="#7c3aed"`, `weight=4`, `opacity: loading ? 0.4 : 0.9`

### OSRM road snapping (`useRoutedPath`)

```
Endpoint: https://router.project-osrm.org/route/v1/driving/{coords}
          ?overview=full&geometries=geojson

Coord format:  lng,lat;lng,lat;...  (OSRM=lng-first, Leaflet=lat-first — always swap)
Response:      routes[0].geometry.coordinates → [[lng,lat]] → convert to [[lat,lng]]

Chunking:      100 coords/request max; chunks overlap by 1 point
Stitching:     trim first point of each subsequent chunk result

Debounce:
  - hasRouted ref = false → delay = 0 (immediate, on first non-empty points)
  - hasRouted ref = true  → delay = 30 000 ms
  - points reset to []   → hasRouted = false (next non-empty fires immediately)

Cancellation:  AbortController per request; new timer aborts previous
  AbortError → keep existing route silently
  Other error → setLoading(false), keep existing route
```

### GPS pins

- Latest point (index n-1): radius 7, `#e74c3c` red
- All others: radius 4, `#3498db` blue

### Compass overlay

Position: `bottom: 28px, left: 10px`, `pointer-events: none`, `z-index: 1001`

SVG (72×72):
- Outer circle: white/92% opacity, `rgba(0,0,0,0.18)` 1.5px border, drop shadow
- N/S/E/W tick marks + labels (N bold)
- Needle `<g transform="rotate({heading}, 40, 40)">`:
  - North half: red `#e74c3c` triangle pointing up
  - South half: gray `#bbb` triangle pointing down
- Center dot: `#333`, r=3.5
- Degree badge below: `{Math.round(heading)}°`

Heading source: `kff1007` (Heading GPS, 0–360°, 0=North)
- Live: `extractKpiMap(history[0])['kff1007']`
- Replay: `extractKpiMap(currentRecord)['kff1007']`

---

## 13. Replay View (`ReplayPage`)

### Layout

```
┌────────────────────────────────────────────────────────────────┐
│ APP HEADER  "Patronus — Replay"         🔖(dis) 🚗(dis) 📻Live │
├────────────────────────────────────────────────────────────────┤
│ TRIP SELECTOR  [Trips | Custom Range]  date pickers  trip chips │
├────────────────────────────────────────────────────────────────┤
│ REPLAY HEADER  Date  Start  End  Duration  Records  Frame  Time │
├────────────────────────────────────────────────────────────────┤
│ REPLAY CONTROLS  ▶/⏸  ──scrubber──  frame count  1× 2× 5× 10× 20× │
├──────────────────────────┬─────────────────────────────────────┤
│  MAP (same as live)      │  KPI SECTION (hero + tabs + grid)   │
└──────────────────────────┴─────────────────────────────────────┘
```

### Data streaming (`useReplayStream`)

```
On source change:
  Reset records=[], total=0, frame=0, playing=false
  Fetch page 0: GET /api/obd2/history/paged?start&end&offset=0&limit=100

Pre-fetch: when (records.length - frame) <= 25 AND nextOffset < total
  → fetch next page, append

Play timer: setInterval(600ms / speed) → frame++
  Stall if frame >= records.length (buffer not yet arrived)
  Auto-stop if frame >= records.length - 1 AND nextOffset >= total

Seek: clamp to [0, records.length - 1]
Speed options: 1×, 2×, 5×, 10×, 20×
```

### Map in replay

`mapPoints = getPathPoints(records.slice(0, frame + 1))`

Path grows as frames advance — trip replays drawn in real-time.

---

## 14. PWA Configuration

### Manifest

```json
{
  "name": "Patronus — Live Telemetry",
  "short_name": "Patronus",
  "display": "standalone",
  "orientation": "portrait-primary",
  "theme_color": "#1a1a2e",
  "background_color": "#1a1a2e",
  "start_url": "/",
  "icons": [
    { "src": "icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" },
    { "src": "apple-touch-icon.png", "sizes": "180x180", "type": "image/png" }
  ]
}
```

### Service worker caching strategy

| Asset type | Strategy | Details |
|---|---|---|
| Build assets (JS/CSS) | Cache-first, 1-year immutable | Vite content-hashes filenames; safe to cache forever |
| `/api/*` routes | NetworkFirst | 8s timeout; falls back to cache if offline |
| `index.html` | No-cache (`no-store`) | Always fetched fresh — ensures new deploys load immediately |

### Install requirement

PWA install prompt only appears on **HTTPS** (or `localhost`). LAN HTTP addresses (`http://192.168.x.x`) do not qualify as secure contexts — Chrome will not show the install banner. Test installation via the deployed Railway URL (HTTPS).

### Icons

Source: `frontend/public/icon.svg` — 1024×1024 dark navy gradient with glowing route path, ECG waveform, map pin, and car illustration. PNGs generated from the SVG via `sharp`.

---

## 15. Server API Reference

All routes are prefixed `/api`.

### `GET /api/obd2/history`
Returns: `OBD2Record[]` — latest 100 records, `receivedAt` descending.

### `GET /api/obd2/history/paged`
Params: `start`, `end` (ISO), `offset` (int), `limit` (int, max 500)
Returns: `{ records, total, offset, limit }` — records `receivedAt` ascending.

### `GET /api/trips`
Params: `start`, `end` (ISO, defaults: last 7 days)
Returns: `Trip[]` — newest first.

Trip detection: gap > 3 hours between consecutive `receivedAt` values = new trip.
`tripId = 'trip_' + i` after reverse — positional, not durable.

### `GET /api/keys`
Returns full `data.json` — all fields including `tab`, `unit`, `alerts`.

### Static file serving
```js
// Hashed assets — cache forever
express.static('public', { maxAge: '1y', immutable: true, etag: false })

// index.html — never cache
res.set('Cache-Control', 'no-store')
res.sendFile('public/index.html')
```

---

## 16. KPI Key Reference

| Key | Sensor | Tab | Unit | Alert |
|---|---|---|---|---|
| `kd` | Speed (OBD) | engine | km/h | amber ≥81, red ≥101 |
| `kc` | Engine RPM | engine | — | amber ≥3001, red ≥5001 |
| `k4` | Engine Load | engine | % | amber ≥80, red ≥95 |
| `k43` | Engine Load (Abs) | engine | % | — |
| `k5` | Coolant Temp | engine | °C | amber ≥95, red ≥100 |
| `k5c` | Oil Temp | engine | °C | amber ≥100, red ≥120 |
| `k70` | GPS Altitude ALT | gps | m | — |
| `k73` | Exhaust Pressure | engine | kPa | — |
| `k2f` | Fuel Level | fuel | % | amber ≤20, red ≤10 |
| `kff1225` | Torque | performance | Nm | — |
| `kff1226` | Horsepower | performance | hp | — |
| `kff1005` | GPS Longitude | gps | — | — |
| `kff1006` | GPS Latitude | gps | — | — |
| `kff1007` | Heading (GPS) | gps | ° | — |
| `kff1001` | Speed (GPS) | gps | km/h | — |
| `kff1010` | GPS Altitude | gps | m | — |
| `kff126a` | Distance to Empty | fuel | km | amber ≤400, red ≤200 |
| `kff129a` | Device Battery Level | gps | % | amber ≤30, red ≤15 |
| `kff12a4` | G-Force X (Lateral) | gps | G* | — |
| `kff12a5` | G-Force Y (Vertical/Gravity) | gps | G* | — |
| `kff12a6` | G-Force Z (Accel/Brake) | gps | G* | — |
| `kff12ab` | G-Force Total (Vector Sum) | gps | G* | — |

*G unit: raw value ÷ 100 by `UNIT_PARSERS['G']`. Display value is actual G-force.

---

## 17. Mobile Layout (≤768px)

```css
.landing        → flex-direction: column
.map-section    → width: 100%, height: 240px
.kpi-section    → overflow: visible
.kpi-body       → flex-direction: row (tab bar stays vertical on left)
.kpi-tab-bar    → flex-direction: column, 28×28px buttons
.kpi-grid       → minmax(130px, 1fr), gap 6px
.kpi-card       → padding: 8px 10px
.kpi-card label → 0.62rem
.kpi-card value → 1.05rem (alert values override to 1.5rem via higher specificity)
.gauge svg      → max-width: 90px
.stat-box       → padding: 6px 8px
```

Note on specificity: mobile overrides use `.kpi-card .kpi-value` (0-2-0). Alert value overrides use `.kpi-card.kpi-alert-{level} .kpi-value` (0-3-0) — two classes on same element — so alert sizes win on mobile too.

---

## 18. Component Dependency Tree

```
App
├── LandingPage
│   ├── MapView
│   │   └── useRoutedPath (hook)
│   ├── KpiHero
│   ├── KpiCard → FormattedValue → parseUnit()
│   └── InfoModal (disabled — future)
├── ReplayPage
│   ├── TripSelector (TripsMode / CustomRangeMode)
│   ├── ReplayHeader
│   ├── ReplayControls
│   ├── MapView → useRoutedPath (hook)
│   ├── KpiHero
│   └── KpiCard → FormattedValue → parseUnit()
└── KpiDetail → FormattedValue

Hooks
├── useReplayStream   paged streaming, pre-fetch, play timer
├── useTrips          trip list fetch with date range state
├── useRoutedPath     OSRM debounce + AbortController
└── useReplay         (legacy, superseded by useReplayStream)
```

---

## 19. Critical Implementation Rules

1. **Values are always strings.** Never assume numeric type from MongoDB.
2. **KPI keys are lowercase hex-ish strings** (`kd`, `kc`, `kff1006`). Case-sensitive.
3. **History is newest-first.** Reverse before rendering time-series charts.
4. **`receivedAt` is the canonical timestamp** — not the `time` field (OBD Unix ms string, unreliable).
5. **Tab filtering:** `tabMap[key] === activeTab` for named tabs; `!tabMap[key]` for Misc. Empty `tabMap` means the backend hasn't restarted after a data.json change — restart it.
6. **OSRM coords are lng,lat; Leaflet is lat,lng.** Always swap at the API boundary.
7. **`useRoutedPath` fires immediately on first non-empty points** then debounces 30s. Never call OSRM on every poll.
8. **AbortController cancels in-flight OSRM requests.** On AbortError, keep the existing route — no flash to straight lines.
9. **Sticky hero tiles use a ref, not state.** Stale values show grayed out; components do not re-render solely due to the cache update.
10. **Alert specificity rule:** Use `.kpi-card.kpi-alert-{level} .kpi-value` (0-3-0) not `.kpi-alert-{level} .kpi-value` (0-2-0) to beat mobile CSS overrides.
11. **G-force unit parser:** 100 = 1G. Always divide raw value by 100 before display. Register as `UNIT_PARSERS['G']`.
12. **Trip IDs are positional** (`trip_0` = newest). They change as new trips are added. Never persist them.
13. **PWA install requires HTTPS.** LAN IP over HTTP will not trigger the browser's install prompt. Deploy to Railway (HTTPS) to test installation.
14. **index.html must never be cached.** Serve with `Cache-Control: no-store`. Hashed JS/CSS assets can and should be cached with `immutable, max-age=1y`.
15. **`staticUnitMap` is the last fallback for units** — below OBD device metadata. Use it for sensors whose units are known statically (exhaust pressure, G-force, battery %) but not always sent by the device.
