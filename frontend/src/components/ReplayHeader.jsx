function fmtDuration(ms) {
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`
}

function fmtTime(date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function Stat({ label, value }) {
  return (
    <div className="rh-stat">
      <span className="rh-label">{label}</span>
      <span className="rh-value">{value}</span>
    </div>
  )
}

export default function ReplayHeader({ trip, frame, total, currentRecord }) {
  if (!trip) return null

  const frameTime = currentRecord ? new Date(currentRecord.receivedAt) : null
  const elapsed = frameTime ? frameTime - trip.startTime : 0

  return (
    <div className="replay-header">
      <Stat label="Date" value={trip.startTime.toLocaleDateString()} />
      <Stat label="Start" value={fmtTime(trip.startTime)} />
      <Stat label="End" value={fmtTime(trip.endTime)} />
      <Stat label="Duration" value={fmtDuration(trip.durationMs)} />
      <Stat label="Records" value={trip.recordCount} />
      <div className="rh-divider" />
      <Stat label="Frame" value={`${frame + 1} / ${total}`} />
      {frameTime && <Stat label="Time" value={fmtTime(frameTime)} />}
      {elapsed > 0 && <Stat label="Elapsed" value={fmtDuration(elapsed)} />}
    </div>
  )
}
