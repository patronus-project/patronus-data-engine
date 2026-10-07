import { formatDateShort, formatTimeShort } from './utils'
import TripInfo from './TripInfo'

const DASH = '—'

function fmtDuration(ms) {
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`
}

function Stat({ label, value }) {
  return (
    <div className="rh-stat">
      <span className="rh-label">{label}</span>
      <span className="rh-value">{value}</span>
    </div>
  )
}

// Stats that belong together, divided from the next group on wide screens
const Group = ({ children }) => <div className="rh-group">{children}</div>

// Every stat is always rendered (a dash until known) so the header never changes shape while the replay plays.
// progress: { km, percent } — kilometres travelled so far and % of the trip done (by trip time).
// frameMs: the playhead's time (from the trip timeline, so it is known even while a far seek is still buffering)
// tripTimeMs: driving time so far across all days, long breaks left out. lastBreakMs: the most recent pause of 30 min+.
export default function ReplayHeader({ trip, frame, total, frameMs, dayInfo, tripTimeMs, lastBreakMs, progress }) {
  if (!trip) return null

  const elapsed = frameMs != null ? frameMs - trip.startTime : null

  return (
    <div className="replay-header">
      <Group>
        <Stat label="Start Date" value={formatDateShort(trip.startTime)} />
        <Stat label="Start Time" value={formatTimeShort(trip.startTime)} />
        <Stat label="End Date" value={formatDateShort(trip.endTime)} />
        <Stat label="End Time" value={formatTimeShort(trip.endTime)} />
        <Stat label="Duration" value={fmtDuration(trip.durationMs)} />
        <Stat label="Records" value={trip.recordCount} />
      </Group>
      <Group>
        <Stat label="Frame" value={`${frame + 1} / ${total}`} />
        <Stat label="Time" value={frameMs != null ? formatTimeShort(new Date(frameMs)) : DASH} />
        <Stat label="Elapsed" value={elapsed != null && elapsed >= 0 ? fmtDuration(elapsed) : DASH} />
      </Group>
      <Group>
        <Stat label="Day" value={dayInfo ? `${dayInfo.index} of ${dayInfo.total}` : DASH} />
        <Stat label="Trip Time" value={tripTimeMs != null ? fmtDuration(tripTimeMs) : DASH} />
        <Stat label="Last Break" value={lastBreakMs != null ? fmtDuration(lastBreakMs) : DASH} />
        <Stat label="Distance" value={progress.km != null ? `${progress.km.toFixed(1)} km` : DASH} />
        <Stat label="Progress" value={progress.percent != null ? `${Math.round(progress.percent)}%` : DASH} />
      </Group>
      <TripInfo trip={trip} />
    </div>
  )
}
