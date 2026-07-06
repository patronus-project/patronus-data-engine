import { useEffect, useState } from 'react'
import { getDigitSegments } from './utils'

const BASE_POLL_INTERVAL_SEC = 10

// Backs off the poll cadence as telemetry gets staler — no point hammering the API every
// 10s once the driver's been offline for hours. Multiplies the base interval only; doesn't
// need getTelemetryStatus itself, just whatever status string the caller already computed.
const POLL_MULTIPLIER_BY_STATUS = {
  live: 1,
  'stale-short': 3,
  'stale-long': 6,
  'no-trips': 12,
}

// Owns the live-poll cycle end to end: triggers onRefresh on its own schedule and renders
// its own countdown from that schedule — callers just supply onRefresh (and the current
// telemetry status, to back off the cadence), nothing about interval timing or display
// leaks out to them.
export default function AutoRefreshBar({ onRefresh, status }) {
  const pollIntervalSec = BASE_POLL_INTERVAL_SEC * (POLL_MULTIPLIER_BY_STATUS[status] ?? 1)

  // A single 1s ticking counter drives both the countdown display and the refresh trigger —
  // no wall-clock diffing, no refs read during render.
  const [tickCount, setTickCount] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTickCount(c => c + 1), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (tickCount > 0 && tickCount % pollIntervalSec === 0) onRefresh()
  }, [tickCount, pollIntervalSec, onRefresh])

  // A pure modulo cycle (9,8,...,0,9,...) rather than counting down to the exact async
  // fetch completion — that approach drifted/flashed when the fetch lagged the poll tick
  const nextRefreshInSec = (pollIntervalSec - 1) - (tickCount % pollIntervalSec)

  // At 0, show '--' instead of '00' rather than a fake rollover to the next cycle's value
  const countdownDigits = nextRefreshInSec === 0 ? ['-', '-'] : getDigitSegments(nextRefreshInSec)

  return (
    <div className="refresh-box" title="Next refresh">
      <span className="refresh-label">Refreshes in</span>
      <div className="timer-tubes">
        {countdownDigits.map((digit, i) => (
          <span className="timer-tube" key={i}>{digit}</span>
        ))}
      </div>
    </div>
  )
}
