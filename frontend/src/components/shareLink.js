// Shareable replay links. A saved trip is identified by its id; any other trip by its exact time range
// (positional trip ids renumber, so they can never go in a link).

const REPLAY_PATH = '/replay'

// Stable identity of a trip for highlighting and links
export const tripKey = (trip) => (trip.savedTripId ? trip.savedTripId : `${trip.startTime}|${trip.endTime}`)

// '/replay?trip=<id>' or '/replay?start=<iso>&end=<iso>'
export const buildReplayPath = (trip) => {
  const params = new URLSearchParams()
  if (trip.savedTripId) params.set('trip', trip.savedTripId)
  else {
    params.set('start', new Date(trip.startTime).toISOString())
    params.set('end', new Date(trip.endTime).toISOString())
  }
  return `${REPLAY_PATH}?${params}`
}

// What the page was opened with: null (not a replay link), { trip } or { start, end }
export const parseReplayLink = (location) => {
  if (!location || location.pathname.replace(/\/+$/, '') !== REPLAY_PATH) return null
  const params = new URLSearchParams(location.search)
  const trip = params.get('trip')
  if (trip) return /^[a-f0-9]{24}$/i.test(trip) ? { trip } : null
  const start = params.get('start')
  const end = params.get('end')
  if (start && end && !isNaN(new Date(start)) && !isNaN(new Date(end)) && new Date(start) < new Date(end)) {
    return { start: new Date(start).toISOString(), end: new Date(end).toISOString() }
  }
  return null
}

// Moves the address bar to the trip's link without adding history entries
export const showTripInUrl = (trip) => {
  window.history.replaceState(null, '', trip ? buildReplayPath(trip) : REPLAY_PATH)
}

// The share sheet only on touch devices (phones); desktop browsers' share dialogs are clumsy, so they get the clipboard.
const prefersShareSheet = () => !!navigator.share && window.matchMedia('(pointer: coarse)').matches

// Clipboard API needs HTTPS; over a plain-http LAN address it is undefined, so fall back to a hidden textarea
const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const box = document.createElement('textarea')
    box.value = text
    box.style.position = 'fixed'
    box.style.opacity = '0'
    document.body.appendChild(box)
    box.select()
    const ok = document.execCommand('copy')
    box.remove()
    return ok
  }
}

// Resolves 'shared' | 'copied' | 'failed'
export const shareTripLink = async (trip, title) => {
  const url = `${window.location.origin}${buildReplayPath(trip)}`
  if (prefersShareSheet()) {
    try {
      await navigator.share({ title, url })
      return 'shared'
    } catch (err) {
      if (err && err.name === 'AbortError') return 'shared' // the person closed the sheet; nothing to report
    }
  }
  return (await copyText(url)) ? 'copied' : 'failed'
}
