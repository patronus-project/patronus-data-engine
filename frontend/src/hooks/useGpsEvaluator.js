import { useEffect, useRef, useState } from 'react'
import { extractKpiMap, getExtSyncTs } from '../components/utils'

const OBD_SPEED_KEY  = 'k0d'      // OBD vehicle speed (km/h), PID 0x0D
const TORQUE_LAT_KEY = 'kff1006'  // Torque GPS latitude
const TORQUE_LON_KEY = 'kff1005'  // Torque GPS longitude
const TORQUE_SPD_KEY = 'kff1001'  // Torque GPS speed (km/h) — verify against your PIDs

const EXT_MS_TO_KMH      = 3.6   // mendhak sends m/s
const STALE_THRESHOLD    = 3      // consecutive frozen coords → stream is stale
const MOVING_KMH         = 5     // ignore records below this speed
const WINDOW_MS          = 30000
const EVAL_INTERVAL_MS   = 30000

function stdDev(arr) {
  if (arr.length < 2) return Infinity
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length
  const variance = arr.reduce((s, x) => s + (x - mean) ** 2, 0) / arr.length
  return Math.sqrt(variance)
}

function evaluateGps(records, extMap, currentSource) {
  const now = Date.now()

  // Only the last 30-second window, oldest-first
  const window = records
    .filter(r => r.receivedAt && (now - new Date(r.receivedAt).getTime()) <= WINDOW_MS)
    .slice()
    .reverse()

  if (window.length === 0) return { source: currentSource, reason: 'no-data' }

  // Build frame array with both streams extracted
  const frames = window.map(rec => {
    const kvm = extractKpiMap(rec)
    const syncTs = getExtSyncTs(rec.time)
    const extDoc = syncTs != null ? extMap.get(syncTs) : null
    const eg = extDoc?.extGps ?? {}
    return {
      obdSpeed: parseFloat(kvm[OBD_SPEED_KEY]),
      tLat:     parseFloat(kvm[TORQUE_LAT_KEY]),
      tLon:     parseFloat(kvm[TORQUE_LON_KEY]),
      tSpd:     parseFloat(kvm[TORQUE_SPD_KEY]),
      eLat:     parseFloat(eg.lat),
      eLon:     parseFloat(eg.lon),
      eSpd:     parseFloat(eg.spd) * EXT_MS_TO_KMH,
    }
  })

  // ── Phase 1: Stagnation filter ──────────────────────────────────────────
  let tStale = 0, eStale = 0, movingCount = 0
  for (let i = 1; i < frames.length; i++) {
    const f = frames[i], p = frames[i - 1]
    if (isNaN(f.obdSpeed) || f.obdSpeed <= MOVING_KMH) continue
    movingCount++
    if (!isNaN(f.tLat) && !isNaN(p.tLat) && f.tLat === p.tLat && f.tLon === p.tLon) tStale++
    if (!isNaN(f.eLat) && !isNaN(p.eLat) && f.eLat === p.eLat && f.eLon === p.eLon) eStale++
  }

  if (movingCount >= STALE_THRESHOLD) {
    const tFrozen = tStale >= STALE_THRESHOLD
    const eFrozen = eStale >= STALE_THRESHOLD
    if (tFrozen && !eFrozen) return { source: 'ext',    reason: 'torque-frozen' }
    if (eFrozen && !tFrozen) return { source: 'torque', reason: 'ext-frozen' }
  }

  // ── Phase 2: Variance math ───────────────────────────────────────────────
  const torqueDeltas = [], extDeltas = []
  for (const f of frames) {
    if (isNaN(f.obdSpeed) || f.obdSpeed <= MOVING_KMH) continue
    if (!isNaN(f.tSpd)) torqueDeltas.push(f.obdSpeed - f.tSpd)
    if (!isNaN(f.eSpd)) extDeltas.push(f.obdSpeed - f.eSpd)
  }

  const tSd = stdDev(torqueDeltas)
  const eSd = stdDev(extDeltas)

  // ── Phase 3: Decision ────────────────────────────────────────────────────
  if (tSd === eSd) return { source: currentSource, reason: 'tie' }
  return tSd < eSd
    ? { source: 'torque', reason: 'lower-variance' }
    : { source: 'ext',    reason: 'lower-variance' }
}

export function useGpsEvaluator(records, extMap) {
  const recordsRef = useRef(records)
  const extMapRef  = useRef(extMap)
  const currentRef = useRef('ext')
  const [result, setResult] = useState({ source: 'ext', reason: 'init' })

  useEffect(() => { recordsRef.current = records }, [records])
  useEffect(() => { extMapRef.current  = extMap  }, [extMap])

  useEffect(() => {
    function run() {
      const r = evaluateGps(recordsRef.current, extMapRef.current, currentRef.current)
      currentRef.current = r.source
      setResult(r)
    }
    run()
    const id = setInterval(run, EVAL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [])

  return result
}
