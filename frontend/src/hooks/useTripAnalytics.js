import { useEffect, useState } from 'react'

const POLL_MS = 3000
const MAX_POLLS = 40   // ~2 minutes: a day-long trip computes in seconds, so this only runs out if something is wrong

// A saved trip's analytics. The server computes them in the background the first time they are asked for (HTTP 202),
// so this keeps asking until they arrive.
// status: 'loading' | 'pending' | 'ready' | 'unavailable' (not enough data) | 'error'
export const useTripAnalytics = (tripId) => {
  const [state, setState] = useState({ status: 'loading', analytics: null, error: null })

  useEffect(() => {
    let cancelled = false
    let timer = null

    const load = (attempt) => {
      fetch(`/api/trips/saved/${tripId}/analytics`)
        .then(async (res) => {
          if (res.status === 404) throw new Error('This trip no longer exists.')
          if (!res.ok && res.status !== 202) throw new Error(`The server answered HTTP ${res.status}.`)
          return res.json()
        })
        .then((body) => {
          if (cancelled) return
          if (body.status === 'ready') {
            setState({ status: body.analytics.unavailable ? 'unavailable' : 'ready', analytics: body.analytics, error: null })
          } else if (attempt < MAX_POLLS) {
            setState((s) => ({ ...s, status: 'pending' }))
            timer = setTimeout(() => load(attempt + 1), POLL_MS)
          } else {
            setState({ status: 'error', analytics: null, error: 'The summary is still being prepared. Try again in a moment.' })
          }
        })
        .catch((err) => { if (!cancelled) setState({ status: 'error', analytics: null, error: err.message }) })
    }

    load(0)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [tripId])

  return state
}
