import { useEffect, useMemo, useState } from 'react'
import { splitIntoDays, frameClocks, SHORT_BREAK_MS } from '../components/tripDays'

// The guessed days of the replay source, the receive time of every frame (times[frame]) and the per-frame trip-time /
// last-break clocks (see tripDays.js).
// Only trips longer than a short break (30 min) can contain a break, so shorter ones skip the request; until the timeline
// arrives the result is empty arrays.
export const useTripDays = (source) => {
  const start = source ? source.start : null
  const end = source ? source.end : null
  const key = start && end ? `${start}|${end}` : ''
  const [loaded, setLoaded] = useState({ key: '', times: [] })

  useEffect(() => {
    if (!key || new Date(end) - new Date(start) < SHORT_BREAK_MS) return undefined
    let cancelled = false
    fetch(`/api/obd2/timeline?${new URLSearchParams({ start, end })}`)
      .then(r => r.json())
      .then(times => { if (!cancelled && Array.isArray(times)) setLoaded({ key, times }) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [key, start, end])

  return useMemo(() => {
    const times = loaded.key === key ? loaded.times : []
    return { days: splitIntoDays(times), times, clocks: frameClocks(times) }
  }, [loaded, key])
}
