export function extractKpiMap(record) {
  const map = {}
  if (!record.kpis) return map
  record.kpis.forEach(kpi => {
    const key = Object.keys(kpi)[0]
    if (key) map[key] = kpi[key]
  })
  return map
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
