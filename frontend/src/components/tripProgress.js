// How far along a replay is: kilometres travelled so far and the share of the trip done. Pure maths, no React.

// A longer silence than this between two readings is a break (parked, no signal), not driving: it adds no distance
const MAX_DRIVING_GAP_MS = 60 * 1000

// speedsKmh[i]: vehicle speed at record i, or null when there is none; timesMs[i]: its time.
// Returns km travelled up to and including each record: a running total of (average of two neighbouring speeds) × time
// between them, which is exactly "average speed × driving time" without having to keep a rolling average. Breaks add
// nothing, so an overnight stop doesn't count as driving. Records with no speed carry the total forward.
export const cumulativeKmFromSpeed = (speedsKmh, timesMs) => {
  const out = new Array(speedsKmh.length)
  let km = 0
  let prevSpeed = null
  let prevMs = null
  speedsKmh.forEach((speed, i) => {
    if (speed != null && Number.isFinite(speed)) {
      const dt = timesMs[i] - prevMs
      if (prevSpeed != null && dt > 0 && dt <= MAX_DRIVING_GAP_MS) km += ((prevSpeed + speed) / 2) * (dt / 3600000)
      prevSpeed = speed
      prevMs = timesMs[i]
    }
    out[i] = km
  })
  return out
}

// Share (0–100) of the trip done: trip time so far over the trip's total trip time (both with long breaks left out,
// so an overnight stop doesn't push the figure forward). null when it can't be told.
export const tripPercent = (doneMs, totalMs) => {
  if (doneMs == null || !(totalMs > 0)) return null
  return Math.min(100, Math.max(0, (doneMs / totalMs) * 100))
}
