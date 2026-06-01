import { useState, useMemo } from 'react'
import { useTrips } from '../hooks/useTrips'
import { useReplayStream } from '../hooks/useReplayStream'
import { extractKpiMap, getPathPoints } from './utils'
import TripSelector from './TripSelector'
import ReplayHeader from './ReplayHeader'
import ReplayControls from './ReplayControls'
import MapView from './MapView'
import KpiCard from './KpiCard'

export default function ReplayPage({ keyMap, onExit }) {
  const [mode, setMode] = useState('trips')

  // Trips mode state
  const { trips, loading: tripsLoading, dateFrom, dateTo, setDateFrom, setDateTo } = useTrips()
  const [selectedTrip, setSelectedTrip] = useState(null)

  // Custom range mode state
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [activeCustom, setActiveCustom] = useState(null) // committed range

  // Derive the source passed to the stream hook
  const source = useMemo(() => {
    if (mode === 'trips' && selectedTrip) {
      return { start: selectedTrip.startTime, end: selectedTrip.endTime }
    }
    if (mode === 'custom' && activeCustom) {
      return activeCustom
    }
    return null
  }, [mode, selectedTrip, activeCustom])

  const {
    records, total, frame, playing, speed, buffering,
    currentRecord, play, pause, seek, setSpeed,
  } = useReplayStream(source)

  const currentKpis = useMemo(() => {
    if (!currentRecord) return []
    return Object.entries(extractKpiMap(currentRecord)).map(([key, value]) => ({ key, value }))
  }, [currentRecord])

  const mapPoints = useMemo(() => {
    if (records.length === 0) return []
    return getPathPoints(records.slice(0, frame + 1))
  }, [records, frame])

  function handleModeChange(next) {
    setMode(next)
    setSelectedTrip(null)
    setActiveCustom(null)
  }

  function handleSelectTrip(trip) {
    setSelectedTrip(trip)
  }

  function handleLoadCustom() {
    if (customStart && customEnd) {
      setActiveCustom({ start: customStart, end: customEnd })
    }
  }

  // Summary object ReplayHeader expects
  const tripSummary = useMemo(() => {
    if (mode === 'trips' && selectedTrip) {
      return {
        startTime: new Date(selectedTrip.startTime),
        endTime: new Date(selectedTrip.endTime),
        durationMs: selectedTrip.durationMs,
        recordCount: selectedTrip.recordCount,
      }
    }
    if (mode === 'custom' && activeCustom) {
      const s = new Date(activeCustom.start)
      const e = new Date(activeCustom.end)
      return {
        startTime: s,
        endTime: e,
        durationMs: e - s,
        recordCount: total,
      }
    }
    return null
  }, [mode, selectedTrip, activeCustom, total])

  return (
    <div className="page-wrapper">
      <div className="app-header">
        <span>Patronus — Replay</span>
        <button className="header-action-btn" onClick={onExit}>← Live</button>
      </div>

      <TripSelector
        mode={mode}
        onModeChange={handleModeChange}
        trips={trips}
        tripsLoading={tripsLoading}
        selectedTripId={selectedTrip?.tripId}
        onSelectTrip={handleSelectTrip}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFrom={setDateFrom}
        onDateTo={setDateTo}
        customStart={customStart}
        customEnd={customEnd}
        onCustomStart={setCustomStart}
        onCustomEnd={setCustomEnd}
        onLoadCustom={handleLoadCustom}
      />

      {source ? (
        <>
          <ReplayHeader trip={tripSummary} frame={frame} total={total} currentRecord={currentRecord} />
          <ReplayControls
            playing={playing}
            frame={frame}
            total={total}
            speed={speed}
            buffering={buffering}
            onPlay={play}
            onPause={pause}
            onSeek={seek}
            onSpeedChange={setSpeed}
          />
          <div className="landing">
            <div className="map-section">
              <MapView points={mapPoints} />
            </div>
            <div className="kpi-section">
              {currentKpis.length === 0 ? (
                <p className="no-data">
                  {buffering && records.length === 0 ? 'Loading records…' : 'No KPI data for this frame.'}
                </p>
              ) : (
                <div className="kpi-grid">
                  {currentKpis.map(({ key, value }) => (
                    <KpiCard key={key} kpiKey={key} label={keyMap[key] || key} value={value} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="replay-empty">
          <p>{mode === 'trips' ? 'Select a trip above to begin replay.' : 'Set a time range and click Load.'}</p>
        </div>
      )}
    </div>
  )
}
