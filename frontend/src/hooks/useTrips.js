import { useState, useEffect, useCallback } from 'react'

function defaultRange() {
  const end = new Date()
  const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000)
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  }
}

// initialFrom ("YYYY-MM-DD"): open the list from that day instead of 7 days back, e.g. when landing on a shared trip link.
// The range always runs to the end of today.
export function useTrips(initialFrom) {
  const range = defaultRange()
  const [dateFrom, setDateFrom] = useState(initialFrom || range.start)
  const [dateTo, setDateTo] = useState(range.end)
  const [trips, setTrips] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchTrips = useCallback(() => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({
      start: dateFrom,
      end: dateTo + 'T23:59:59',
    })
    fetch(`/api/trips?${params}`)
      .then(r => r.json())
      .then(data => { setTrips(data); setLoading(false) })
      .catch(err => { setError(err.message); setLoading(false) })
  }, [dateFrom, dateTo])

  useEffect(() => { fetchTrips() }, [fetchTrips])

  return { trips, loading, error, dateFrom, dateTo, setDateFrom, setDateTo }
}
