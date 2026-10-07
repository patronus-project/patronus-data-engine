import { useMemo } from 'react'
import { extractKpiMap, getExtSpeedKmh } from '../components/utils'
import { cumulativeKmFromSpeed, tripPercent } from '../components/tripProgress'

const OBD_SPEED_KEY = 'kd' // OBD vehicle speed (km/h), PID 0x0D

// OBD speed of a record, cached per record object (re-parsing every record's KPI list on each page would add up)
const obdSpeedCache = new WeakMap()
const obdSpeed = (record) => {
  let speed = obdSpeedCache.get(record)
  if (speed === undefined) {
    const parsed = parseFloat(extractKpiMap(record)[OBD_SPEED_KEY])
    speed = Number.isFinite(parsed) ? parsed : null
    obdSpeedCache.set(record, speed)
  }
  return speed
}

// Kilometres travelled so far and % of the trip done at the playhead (trip time over total trip time). Distance is speed × time: the car's own
// speed (falling back to ext GPS speed where a record has none), so it does not depend on which GPS the map shows.
// Recomputed when records or ext GPS pages arrive, not on every frame step.
export const useTripProgress = ({ records, extMap, frame, tripTimeMs, totalTripMs }) => {
  const cumKm = useMemo(() => {
    const speeds = records.map((r) => obdSpeed(r) ?? getExtSpeedKmh(r, extMap))
    return cumulativeKmFromSpeed(speeds, records.map((r) => new Date(r.receivedAt).getTime()))
  }, [records, extMap])

  return {
    // Not loaded yet (e.g. a far seek still buffering): unknown, rather than a wrong number
    km: frame < cumKm.length ? cumKm[frame] : null,
    percent: tripPercent(tripTimeMs, totalTripMs),
  }
}
