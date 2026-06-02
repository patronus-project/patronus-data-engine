const META_PREFIXES = ['defaultUnit', 'userUnit', 'userShortName', 'userFullName', 'profile']

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
// Prefers userUnit over defaultUnit
export function getKpiUnit(kpiKey, kpiMeta) {
  if (!kpiMeta) return ''
  const id = sensorId(kpiKey)
  const unit = firstOf(kpiMeta.userUnits[id]) ?? firstOf(kpiMeta.defaultUnits[id]) ?? ''
  return unit
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
