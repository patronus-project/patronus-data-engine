// Formatting for the Trip Summary. Clock times are shown in the viewer's own timezone.

const DASH = '—'

export const fmtNum = (n, digits = 0) => (n === null || n === undefined || Number.isNaN(n)
  ? DASH
  : n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits }))

// 79_200_000 ms → "22h 0m"; under an hour → "42m"
export const fmtDuration = (ms) => {
  if (ms === null || ms === undefined) return DASH
  const totalMin = Math.round(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export const fmtHoursShort = (ms) => (ms === null || ms === undefined ? DASH : `${(ms / 3600000).toFixed(1)} h`)

export const fmtClock = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

export const fmtDay = (t) => new Date(t).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })

export const fmtWhen = (t) => `${fmtDay(t)}, ${fmtClock(t)}`

// Local calendar day key, to group events under a heading
export const dayKey = (t) => new Date(t).toDateString()

// The wall-clock time of a point on a chart's trip-time axis, through the continuous segments of the trip clock
export const clockAt = (segments, tripMs) => {
  if (!segments || segments.length === 0) return null
  const seg = segments.find((s) => tripMs >= s.startTm && tripMs <= s.endTm) || segments[segments.length - 1]
  return seg.startAt + (tripMs - seg.startTm)
}

export const hourLabel = (hour) => `${String(hour).padStart(2, '0')}:00`

export const osmLink = (lat, lon) => `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=13/${lat}/${lon}`

// The inverse of clockAt: where a wall-clock moment falls on the trip-time axis (null if it is in a long break)
export const tripXAt = (segments, t) => {
  const seg = (segments || []).find((s) => t >= s.startAt && t <= s.endAt)
  return seg ? seg.startTm + (t - seg.startAt) : null
}
