// ── Static config / constants ──────────────────────────────────────────────

// Each entry: unitString → (rawValue: string) => { value: string, unit: string }
// parseUnit() calls the mapped parser or returns the raw value unchanged.
const UNIT_PARSERS = {
  // Torque Pro encodes G-force as integer*100 (100 = 1.00 G)
  'G': raw => {
    const n = parseFloat(raw)
    return isNaN(n)
      ? { value: raw,               unit: 'G' }
      : { value: (n / 100).toFixed(3), unit: 'G' }
  },
}

const META_PREFIXES = ['defaultUnit', 'userUnit', 'userShortName', 'userFullName', 'profile']

const ELAPSED_UNIT_LABELS = { D: 'days', H: 'hrs', M: 'min', S: 'sec' }

// mendhak GPS Logger reports speed in m/s
const MS_TO_KMH = 3.6

// Live telemetry staleness thresholds
let LIVE_THRESHOLD_MS_MAX        = 30 * 60 * 1000
let SHORT_BREAK_THRESHOLD_MS_MAX = 4 * 60 * 60 * 1000
let LONG_BREAK_THRESHOLD_MS_MAX  = 3 * 24 * 60 * 60 * 1000

  // SHORT_BREAK_THRESHOLD_MS_MAX = LONG_BREAK_THRESHOLD_MS_MAX;

// ── Internal helpers ────────────────────────────────────────────────────────

function isMetaKey(key) {
  return META_PREFIXES.some(p => key.startsWith(p))
}

// Strip leading 'k' from data keys (e.g. 'kff1221' → 'ff1221') to get sensor ID
function sensorId(dataKey) {
  return dataKey.startsWith('k') ? dataKey.slice(1) : dataKey
}

// For scalar or single-element arrays: return as-is.
// For label arrays: skip ECU-prefixed entries (e.g. "ECU(7E9): ...") which can appear in any slot.
function firstOf(val) {
  return Array.isArray(val) ? val[0] : val
}

function bestLabel(val) {
  if (!Array.isArray(val)) return val
  const clean = val.find(v => typeof v === 'string' && !v.startsWith('ECU('))
  return clean ?? val[0]
}

// ── Exported functions ──────────────────────────────────────────────────────

// Returns 'red' | 'amber' | null based on alertMap config for a KPI key
export function getAlertLevel(kpiKey, rawValue, alertMap) {
  const cfg = alertMap?.[kpiKey]
  if (!cfg) return null
  const v = parseFloat(rawValue)
  if (isNaN(v)) return null
  const gte = cfg.dir !== 'lte'
  if (gte) {
    if (v >= cfg.red)   return 'red'
    if (v >= cfg.amber) return 'amber'
  } else {
    if (v <= cfg.red)   return 'red'
    if (v <= cfg.amber) return 'amber'
  }
  return null
}

export function parseUnit(unit, rawValue) {
  if (!unit) return { value: rawValue, unit: '' }
  const parser = UNIT_PARSERS[unit]
  if (!parser) return { value: rawValue, unit }
  return parser(rawValue)
}

// Takes oldest-first records, returns lat/lng path points (every 10th or fewer)
export function getPathPoints(records) {
  const step = Math.max(1, Math.floor(records.length / 150))
  const points = []
  for (let i = 0; i < records.length; i += step) {
    const kpiMap = extractKpiMap(records[i])
    const lat = parseFloat(kpiMap['kff1006'])
    const lng = parseFloat(kpiMap['kff1005'])
    if (!isNaN(lat) && !isNaN(lng)) points.push([lat, lng])
  }
  return points
}

// Same as getPathPoints but uses ext GPS coordinates
export function getExtPathPoints(records, extMap) {
  const step = Math.max(1, Math.floor(records.length / 150))
  const points = []
  for (let i = 0; i < records.length; i += step) {
    const syncTs = getExtSyncTs(records[i].time)
    const extDoc = syncTs != null ? extMap.get(syncTs) : null
    const lat = parseFloat(extDoc?.extGps?.lat)
    const lng = parseFloat(extDoc?.extGps?.lon)
    if (!isNaN(lat) && !isNaN(lng)) points.push([lat, lng])
  }
  return points
}

// Breadcrumb for live view using ext GPS (history is newest-first)
export function getExtBreadcrumb(history, extMap) {
  const points = []
  const ordered = [...history].reverse()
  for (let i = 0; i < ordered.length; i += 10) {
    const syncTs = getExtSyncTs(ordered[i].time)
    const extDoc = syncTs != null ? extMap.get(syncTs) : null
    const lat = parseFloat(extDoc?.extGps?.lat)
    const lng = parseFloat(extDoc?.extGps?.lon)
    if (!isNaN(lat) && !isNaN(lng)) points.push([lat, lng])
  }
  return points
}

export function extractKpiMap(record) {
  const map = {}
  if (!record.kpis) return map
  record.kpis.forEach(kpi => {
    const key = Object.keys(kpi)[0]
    if (key && !isMetaKey(key)) map[key] = kpi[key]
  })
  return map
}

// Scans history and accumulates metadata keyed by sensor ID (e.g. 'ff1221')
export function getKpiMeta(history) {
  const meta = { defaultUnits: {}, userUnits: {}, shortNames: {}, fullNames: {} }
  history.forEach(record => {
    if (!record.kpis) return
    record.kpis.forEach(kpi => {
      const key = Object.keys(kpi)[0]
      if (!key) return
      if (key.startsWith('defaultUnit')) {
        const id = key.slice('defaultUnit'.length)
        if (!(id in meta.defaultUnits)) meta.defaultUnits[id] = kpi[key]
      } else if (key.startsWith('userUnit')) {
        const id = key.slice('userUnit'.length)
        if (!(id in meta.userUnits)) meta.userUnits[id] = kpi[key]
      } else if (key.startsWith('userShortName')) {
        const id = key.slice('userShortName'.length)
        if (!(id in meta.shortNames)) meta.shortNames[id] = kpi[key]
      } else if (key.startsWith('userFullName')) {
        const id = key.slice('userFullName'.length)
        if (!(id in meta.fullNames)) meta.fullNames[id] = kpi[key]
      }
    })
  })
  return meta
}

// Returns the unit string to display for a given data key (e.g. 'kff1221')
// Priority: userUnit (from OBD device) > defaultUnit (from OBD device) > staticUnitMap (from data.json)
export function getKpiUnit(kpiKey, kpiMeta, staticUnitMap) {
  const id = sensorId(kpiKey)
  const dynamic = kpiMeta ? (firstOf(kpiMeta.userUnits[id]) ?? firstOf(kpiMeta.defaultUnits[id])) : null
  return dynamic ?? staticUnitMap?.[kpiKey] ?? ''
}

// Returns display label: prefers userShortName > userFullName > keyMap > key
export function getKpiLabel(kpiKey, kpiMeta, keyMap) {
  if (kpiMeta) {
    const id = sensorId(kpiKey)
    const short = kpiMeta.shortNames[id]
    if (short) return bestLabel(short)
    const full = kpiMeta.fullNames[id]
    if (full) return bestLabel(full)
  }
  return keyMap?.[kpiKey] || kpiKey
}

// Returns [{ key, value, receivedAt }] — one entry per unique KPI key (most recent value)
// history is sorted newest first
export function getTopKpis(history) {
  const seen = new Set()
  const result = []
  history.forEach(record => {
    const kpiMap = extractKpiMap(record)
    Object.entries(kpiMap).forEach(([key, value]) => {
      if (!seen.has(key)) {
        seen.add(key)
        result.push({ key, value, receivedAt: record.receivedAt })
      }
    })
  })
  return result
}

// Returns [[lat, lng], ...] for every 10th record that has GPS coords
// history is sorted newest first — we reverse to get oldest→newest trail
export function getBreadcrumb(history) {
  const points = []
  const ordered = [...history].reverse()
  for (let i = 0; i < ordered.length; i += 10) {
    const kpiMap = extractKpiMap(ordered[i])
    const lat = parseFloat(kpiMap['kff1006'])
    const lng = parseFloat(kpiMap['kff1005'])
    if (!isNaN(lat) && !isNaN(lng)) {
      points.push([lat, lng])
    }
  }
  return points
}

// Build a Map<sync_ts, extDoc> from ext-history records
export function buildExtMap(extRecords) {
  const map = new Map()
  if (!Array.isArray(extRecords)) return map
  extRecords.forEach(doc => {
    if (doc.sync_ts != null) map.set(doc.sync_ts, doc)
  })
  return map
}

// Floor a record's time string to the nearest 10-second bucket (matches server sync_ts)
export function getExtSyncTs(time) {
  const ms = Number(time)
  if (!ms) return null
  return Math.floor(ms / 10000) * 10000
}

// Ext GPS speed (km/h) for the bucket a record falls in, or null when that bucket has no ext fix
export const getExtSpeedKmh = (record, extMap) => {
  const syncTs = getExtSyncTs(record?.time)
  if (syncTs == null) return null
  const spd = parseFloat(extMap?.get(syncTs)?.extGps?.spd)
  return isNaN(spd) ? null : spd * MS_TO_KMH
}

// GET a list endpoint. Rejects on a non-2xx status (e.g. Railway's 502 HTML page while the service wakes),
// a non-JSON body, or a non-array payload (e.g. { error } from a failed Mongo query) — so callers see one failure path.
export const fetchJsonArray = async (url) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} failed: HTTP ${res.status}`)
  const data = await res.json()
  if (!Array.isArray(data)) throw new Error(`${url} returned an unexpected response`)
  return data
}

// Returns [{ value, receivedAt }] for a specific KPI key across all records
export function getKpiHistory(history, kpiKey) {
  const result = []
  ;[...history].reverse().forEach(record => {
    const kpiMap = extractKpiMap(record)
    if (kpiKey in kpiMap) {
      result.push({ value: kpiMap[kpiKey], receivedAt: record.receivedAt })
    }
  })
  return result
}

// Classifies how stale the last telemetry point is.
// lastData: Date | null (timestamp of most recent received record)
// Returns { status: 'live' | 'stale-short' | 'stale-long' | 'no-trips', message? }
export const getTelemetryStatus = (lastData, now = Date.now()) => {
  if (!lastData) return { status: 'no-trips' }
  const ageMs = now - lastData.getTime()
  // return { status: 'no-trips', message: 'Driver is potentially on a long break or an overnight stop or offline' }
  if (ageMs <= LIVE_THRESHOLD_MS_MAX) return { status: 'live' }
  if (ageMs > LIVE_THRESHOLD_MS_MAX && ageMs <= SHORT_BREAK_THRESHOLD_MS_MAX) return { status: 'stale-short', message: 'Driver is potentially resting or offline' }
  if (ageMs > SHORT_BREAK_THRESHOLD_MS_MAX && ageMs <= LONG_BREAK_THRESHOLD_MS_MAX) return { status: 'stale-long', message: 'Driver is potentially on a long break or an overnight stop or offline' }
  if (ageMs > LONG_BREAK_THRESHOLD_MS_MAX) return { status: 'no-trips' }
}

// Shared date/time formatters — 'DD-MON-YY' and 'HH:MM:SS'
export const formatDateShort = (date) => {
  if (!date) return '—'
  const day = String(date.getDate()).padStart(2, '0')
  const mon = date.toLocaleDateString([], { month: 'short' })
  const yr = String(date.getFullYear()).slice(-2)
  return `${day}-${mon}-${yr}`
}

export const formatTimeShort = (date) => {
  if (!date) return '—'
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// Breaks a duration in ms into { unit, label, display } parts (D/H/M/S), zero-padded.
// Leading zero units are trimmed (e.g. 0 days omitted), but once the leading unit is
// found, every unit below it is kept even if zero — 1m 0s, not just 1m.
export const getElapsedParts = (ms) => {
  const pad = (n) => String(n).padStart(2, '0')
  const safeMs = ms == null || ms < 0 ? 0 : ms
  const days = Math.floor(safeMs / 86400000)
  const hours = Math.floor((safeMs % 86400000) / 3600000)
  const minutes = Math.floor((safeMs % 3600000) / 60000)
  const seconds = Math.floor((safeMs % 60000) / 1000)
  const all = [
    { unit: 'D', value: days },
    { unit: 'H', value: hours },
    { unit: 'M', value: minutes },
    { unit: 'S', value: seconds },
  ]
  const leadingIndex = all.findIndex(p => p.value > 0)
  const parts = leadingIndex === -1 ? [all[all.length - 1]] : all.slice(leadingIndex)
  return parts.map(p => ({ unit: p.unit, label: ELAPSED_UNIT_LABELS[p.unit], display: pad(p.value) }))
}

// Splits a number into individual zero-padded digit characters, e.g. for a nixie-tube
// style display. Always at least `minDigits` wide, but grows if the value needs more
// (e.g. 9 -> ['0','9'], 123 -> ['1','2','3'] when minDigits is 2).
export const getDigitSegments = (value, minDigits = 2) => {
  const n = Math.max(0, Math.floor(value ?? 0))
  const digitCount = Math.max(String(n).length, minDigits)
  return String(n).padStart(digitCount, '0').split('')
}

// Extracts vehicle profile fields from history (first occurrence wins)
// Returns [{ field, value }] with 'profile' prefix stripped from keys
export function getProfileData(history) {
  const seen = {}
  history.forEach(record => {
    if (!record.kpis) return
    record.kpis.forEach(kpi => {
      const key = Object.keys(kpi)[0]
      if (!key || !key.startsWith('profile')) return
      const field = key.slice('profile'.length)
      if (!(field in seen)) seen[field] = kpi[key]
    })
  })
  return Object.entries(seen).map(([field, value]) => ({ field, value }))
}
