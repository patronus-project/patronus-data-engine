// Guesses the "days" of a multi-day trip from its OBD receive times. Frontend-only logic: the server just
// supplies the timestamps (/api/obd2/timeline); where a day starts is decided here.

// A new day starts after a long break (the UI's own long-break threshold, 4 h) that also crosses local midnight.
// The date check keeps a long lunch stop, or a night drive that never pauses, from being counted as a new day.
export const LONG_BREAK_MS = 4 * 60 * 60 * 1000
// A pause of at least this long is a break (the UI's short-break threshold: no data for 30 min or more)
export const SHORT_BREAK_MS = 30 * 60 * 1000

const localDate = (ms) => new Date(ms).toDateString()

// timestamps: ascending epoch ms. Returns [{ start, end }] — one entry per guessed day, oldest first.
export const splitIntoDays = (timestamps) => {
  if (!Array.isArray(timestamps) || timestamps.length === 0) return []
  const days = []
  let start = timestamps[0]
  for (let i = 1; i < timestamps.length; i++) {
    const gap = timestamps[i] - timestamps[i - 1]
    if (gap >= LONG_BREAK_MS && localDate(timestamps[i]) !== localDate(timestamps[i - 1])) {
      days.push({ start, end: timestamps[i - 1] })
      start = timestamps[i]
    }
  }
  days.push({ start, end: timestamps[timestamps.length - 1] })
  return days
}

// Which day the given moment is on: { index (1-based), total }. A single-day trip is "1 of 1". null when there is no data yet.
export const dayInfoAt = (days, ms) => {
  if (!Array.isArray(days) || days.length < 1 || ms == null) return null
  let index = 0
  days.forEach((d, i) => { if (ms >= d.start) index = i })
  return { index: index + 1, total: days.length }
}

// Two clocks for every frame of a trip, from its ascending receive times (frame i is timestamps[i]):
//  - tripTimeMs: driving time so far. Gaps of a long break or more (4 h+, e.g. overnight) are left out, so it carries on
//    across days instead of resetting: the first hour of day 2 reads "day 1's total + 1 h". Shorter pauses still count.
//  - lastBreakMs: length of the most recent pause of 30 min or more at or before that frame; null before the first one.
export const frameClocks = (timestamps) => {
  const tripTimeMs = []
  const lastBreakMs = []
  let driving = 0
  let lastBreak = null
  ;(Array.isArray(timestamps) ? timestamps : []).forEach((t, i) => {
    if (i > 0) {
      const gap = t - timestamps[i - 1]
      if (gap < LONG_BREAK_MS) driving += gap
      if (gap >= SHORT_BREAK_MS) lastBreak = gap
    }
    tripTimeMs.push(driving)
    lastBreakMs.push(lastBreak)
  })
  return { tripTimeMs, lastBreakMs }
}
