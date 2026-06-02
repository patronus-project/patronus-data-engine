import { useState, useEffect, useRef } from 'react'

const OSRM = 'https://router.project-osrm.org'
const CHUNK = 100
const DEBOUNCE_MS = 30_000

async function routeChunk(pts, signal) {
  const coords = pts.map(([lat, lng]) => `${lng},${lat}`).join(';')
  const res = await fetch(
    `${OSRM}/route/v1/driving/${coords}?overview=full&geometries=geojson`,
    { signal }
  )
  const data = await res.json()
  if (data.code !== 'Ok' || !data.routes?.[0]) throw new Error('no route')
  return data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng])
}

async function routeAll(points, signal) {
  const chunks = []
  for (let i = 0; i < points.length; i += CHUNK - 1) {
    chunks.push(points.slice(i, i + CHUNK))
    if (i + CHUNK >= points.length) break
  }
  const parts = []
  for (let i = 0; i < chunks.length; i++) {
    const seg = await routeChunk(chunks[i], signal)
    parts.push(i === 0 ? seg : seg.slice(1))
  }
  return parts.flat()
}

export function useRoutedPath(points) {
  const [routed, setRouted] = useState([])
  const [loading, setLoading] = useState(false)
  const timerRef = useRef(null)
  const abortRef = useRef(null)
  const hasRouted = useRef(false) // tracks whether we've routed this point-set yet
  const key = points.map(p => p.join(',')).join('|')

  useEffect(() => {
    if (points.length < 2) {
      setRouted([])
      hasRouted.current = false // reset so next non-empty set fires immediately
      return
    }

    clearTimeout(timerRef.current)
    abortRef.current?.abort()

    // First call for this point-set fires immediately; subsequent updates debounce
    const delay = hasRouted.current ? DEBOUNCE_MS : 0

    timerRef.current = setTimeout(() => {
      const controller = new AbortController()
      abortRef.current = controller
      setLoading(true)

      routeAll(points, controller.signal)
        .then(pts => { hasRouted.current = true; setRouted(pts); setLoading(false) })
        .catch(err => { if (err.name !== 'AbortError') setLoading(false) })
    }, delay)

    return () => {
      clearTimeout(timerRef.current)
      abortRef.current?.abort()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return { routed, loading }
}
