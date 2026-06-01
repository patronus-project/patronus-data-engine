function fmtDate(dateStr) {
  return new Date(dateStr).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function fmtTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function fmtDuration(ms) {
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

// ── Trips mode ────────────────────────────────────────────────────────────────

function TripsMode({ trips, loading, selectedTripId, onSelect, dateFrom, dateTo, onDateFrom, onDateTo }) {
  return (
    <>
      <div className="date-range">
        <label className="date-label">
          From
          <input type="date" value={dateFrom} onChange={e => onDateFrom(e.target.value)} />
        </label>
        <label className="date-label">
          To
          <input type="date" value={dateTo} onChange={e => onDateTo(e.target.value)} />
        </label>
      </div>
      <div className="trip-divider" />
      <div className="trip-list">
        {loading && <span className="no-trips">Loading trips…</span>}
        {!loading && trips.length === 0 && <span className="no-trips">No trips in range</span>}
        {trips.map(trip => (
          <button
            key={trip.tripId}
            className={`trip-chip${trip.tripId === selectedTripId ? ' active' : ''}`}
            onClick={() => onSelect(trip)}
          >
            <span className="trip-chip-date">{fmtDate(trip.startTime)}</span>
            <span className="trip-chip-time">{fmtTime(trip.startTime)}</span>
            <span className="trip-chip-meta">{fmtDuration(trip.durationMs)} · {trip.recordCount} pts</span>
          </button>
        ))}
      </div>
    </>
  )
}

// ── Custom range mode ─────────────────────────────────────────────────────────

function CustomRangeMode({ customStart, customEnd, onCustomStart, onCustomEnd, onLoad }) {
  const ready = customStart && customEnd && customStart <= customEnd
  return (
    <div className="custom-range">
      <label className="date-label">
        Start
        <input
          type="datetime-local"
          value={customStart}
          onChange={e => onCustomStart(e.target.value)}
        />
      </label>
      <label className="date-label">
        End
        <input
          type="datetime-local"
          value={customEnd}
          onChange={e => onCustomEnd(e.target.value)}
        />
      </label>
      <button className="load-range-btn" onClick={onLoad} disabled={!ready}>
        Load
      </button>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function TripSelector({
  mode, onModeChange,
  trips, tripsLoading, selectedTripId, onSelectTrip,
  dateFrom, dateTo, onDateFrom, onDateTo,
  customStart, customEnd, onCustomStart, onCustomEnd, onLoadCustom,
}) {
  return (
    <div className="trip-selector">
      <div className="mode-toggle">
        <button
          className={`mode-btn${mode === 'trips' ? ' active' : ''}`}
          onClick={() => onModeChange('trips')}
        >
          Trips
        </button>
        <button
          className={`mode-btn${mode === 'custom' ? ' active' : ''}`}
          onClick={() => onModeChange('custom')}
        >
          Custom Range
        </button>
      </div>
      <div className="trip-divider" />
      {mode === 'trips' ? (
        <TripsMode
          trips={trips}
          loading={tripsLoading}
          selectedTripId={selectedTripId}
          onSelect={onSelectTrip}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateFrom={onDateFrom}
          onDateTo={onDateTo}
        />
      ) : (
        <CustomRangeMode
          customStart={customStart}
          customEnd={customEnd}
          onCustomStart={onCustomStart}
          onCustomEnd={onCustomEnd}
          onLoad={onLoadCustom}
        />
      )}
    </div>
  )
}
