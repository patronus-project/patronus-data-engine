import { useState, useMemo, useEffect } from 'react'
import { Droplet, Cpu, Navigation, Zap, MapPin, Activity, BookOpen, Car, Radio, CircleHelp, Satellite } from 'lucide-react'
import { useTrips } from '../hooks/useTrips'
import { useReplayStream } from '../hooks/useReplayStream'
import { extractKpiMap, getPathPoints, getExtPathPoints, getKpiLabel, getKpiUnit, getAlertLevel, buildExtMap, getExtSyncTs } from './utils'
import { useExtGpsToggle } from '../hooks/useExtGpsToggle'
import KpiHero from './KpiHero'
import InfoModal from './InfoModal'
import TripSelector from './TripSelector'
import ReplayHeader from './ReplayHeader'
import ReplayControls from './ReplayControls'
import MapView from './MapView'
import KpiCard from './KpiCard'

const TABS = ['fuel', 'engine', 'trip', 'performance', 'gps', 'sensors', 'misc', 'extgps']
const TAB_LABELS = { fuel: 'Fuel', engine: 'Engine', trip: 'Trip', performance: 'Perf', gps: 'GPS', sensors: 'Sensors', misc: 'Unknown', extgps: 'Ext' }
const TAB_ICONS  = { fuel: <Droplet size={16}/>, engine: <Cpu size={16}/>, trip: <Navigation size={16}/>, performance: <Zap size={16}/>, gps: <MapPin size={16}/>, sensors: <Activity size={16}/>, misc: <CircleHelp size={16}/>, extgps: <Satellite size={16}/> }

export default function ReplayPage({ keyMap, tabMap, staticUnitMap, alertMap, kpiMeta, profileData, onExit }) {
  const [mode, setMode] = useState('trips')
  const [modal, setModal] = useState(null) // null | 'names' | 'profile'

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

  const currentKpiMap = useMemo(() => currentRecord ? extractKpiMap(currentRecord) : {}, [currentRecord])

  const [activeTab, setActiveTab] = useState('fuel')

  const [forceObd, toggleObdOverride] = useExtGpsToggle()
  const [extMap, setExtMap] = useState(new Map())
  const sourceKey = source ? `${source.start}|${source.end}` : ''

  // Sticky KPI map — keeps last-seen value per key, marks missing keys as stale
  const [stickyKpis, setStickyKpis] = useState({})

  useEffect(() => { setStickyKpis({}) }, [sourceKey])

  useEffect(() => {
    const entries = Object.entries(currentKpiMap)
    if (entries.length === 0) return
    setStickyKpis(prev => {
      const next = {}
      Object.entries(prev).forEach(([k, v]) => { next[k] = { value: v.value, stale: true } })
      entries.forEach(([k, v]) => { next[k] = { value: v, stale: false } })
      return next
    })
  }, [currentKpiMap])

  const currentKpis = useMemo(
    () => Object.entries(stickyKpis).map(([key, { value, stale }]) => ({ key, value, stale })),
    [stickyKpis]
  )
  useEffect(() => {
    if (!source) { setExtMap(new Map()); return }
    const params = new URLSearchParams({ start: source.start, end: source.end, limit: 500 })
    fetch(`/api/obd2/ext-history/paged?${params}`)
      .then(r => r.json())
      .then(data => setExtMap(buildExtMap(data.records)))
      .catch(() => {})
  }, [sourceKey])

  const extGpsEntries = useMemo(() => {
    if (!currentRecord?.time) return []
    const syncTs = getExtSyncTs(currentRecord.time)
    const extDoc = syncTs != null ? extMap.get(syncTs) : null
    const extGps = extDoc?.extGps ?? {}
    return Object.entries(extGps).filter(([k]) => k !== 'ts')
  }, [currentRecord, extMap])

  const mapPoints = useMemo(() => {
    if (records.length === 0) return []
    const slice = records.slice(0, frame + 1)
    if (!forceObd) {
      const extPoints = getExtPathPoints(slice, extMap)
      if (extPoints.length > 0) return extPoints
    }
    return getPathPoints(slice)
  }, [records, frame, forceObd, extMap])

  const displayedSource = useMemo(() => {
    if (forceObd || records.length === 0) return 'obd'
    const slice = records.slice(0, frame + 1)
    return getExtPathPoints(slice, extMap).length > 0 ? 'ext' : 'obd'
  }, [records, frame, forceObd, extMap])

  const heading = useMemo(() => {
    if (displayedSource === 'ext' && currentRecord?.time) {
      const syncTs = getExtSyncTs(currentRecord.time)
      const dir = parseFloat(extMap.get(syncTs)?.extGps?.dir)
      if (!isNaN(dir)) return dir
    }
    return parseFloat(currentKpiMap['kff1007']) || 0
  }, [displayedSource, currentRecord, extMap, currentKpiMap])

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

  const ids = useMemo(() => [...new Set([
    ...Object.keys(kpiMeta.shortNames),
    ...Object.keys(kpiMeta.fullNames),
    ...Object.keys(kpiMeta.userUnits),
    ...Object.keys(kpiMeta.defaultUnits),
  ])].sort(), [kpiMeta])

  return (
    <div className="page-wrapper">
      <div className="app-header">
        <span>Patronus — Replay</span>
        <div className="ts-bar">
          <button className="header-action-btn" disabled title="Units &amp; Names"><BookOpen size={15} /></button>
          <button className="header-action-btn" disabled title="Vehicle Profile"><Car size={15} /></button>
          <button
            className="header-action-btn"
            onClick={toggleObdOverride}
            title={forceObd ? 'Forced OBD GPS — click to use best available' : 'Auto GPS — click to force OBD'}
            style={forceObd ? { background: '#e67e22', borderColor: '#e67e22' } : {}}
          ><Satellite size={15} /></button>
          <button className="header-action-btn" onClick={onExit} title="Back to Live"><Radio size={15} /></button>
        </div>
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
              <MapView points={mapPoints} heading={heading} />
              <div className={`map-source-badge ${displayedSource}`}>
                {displayedSource === 'ext' ? 'Ext GPS' : 'OBD GPS'}
              </div>
            </div>
            <div className="kpi-section">
              {currentKpis.length === 0 ? (
                <p className="no-data">
                  {buffering && records.length === 0 ? 'Loading records…' : 'No KPI data for this frame.'}
                </p>
              ) : (
                <>
                  <div className="kpi-hero-pad"><KpiHero kvm={currentKpiMap} /></div>
                  <div className="kpi-body">
                    <div className="kpi-tab-bar">
                      {TABS.map(t => (
                        <button key={t} className={`kpi-tab-item${activeTab === t ? ' active' : ''}`}
                                data-tab={t} data-label={TAB_LABELS[t]} onClick={() => setActiveTab(t)}>
                          {TAB_ICONS[t]}
                        </button>
                      ))}
                    </div>
                    <div className="kpi-grid-area">
                      {activeTab === 'gps' && displayedSource === 'ext' && (
                        <div className="ext-active-toast"><Satellite size={11} /> Ext GPS Active</div>
                      )}
                      {activeTab === 'extgps' && displayedSource === 'obd' && (
                        <div className="ext-active-toast obd"><MapPin size={11} /> OBD GPS Active</div>
                      )}
                      {activeTab === 'extgps' ? (
                        extGpsEntries.length === 0
                          ? <p className="no-data">No Ext GPS data for this frame.</p>
                          : <div className="kpi-grid">
                              {extGpsEntries.map(([k, v]) => (
                                <KpiCard key={k} kpiKey={k} label={keyMap[k] || k} value={String(v)} unit={staticUnitMap[k] || ''} />
                              ))}
                            </div>
                      ) : (
                        currentKpis.filter(({ key }) => activeTab === 'misc' ? !tabMap[key] : tabMap[key] === activeTab).length === 0 ? (
                          <p className="no-data">No {TAB_LABELS[activeTab]} data for this frame.</p>
                        ) : (
                          <div className="kpi-grid">
                            {currentKpis.filter(({ key }) => activeTab === 'misc' ? !tabMap[key] : tabMap[key] === activeTab).map(({ key, value, stale }) => (
                              <KpiCard key={key} kpiKey={key} label={getKpiLabel(key, kpiMeta, keyMap)} value={value} unit={getKpiUnit(key, kpiMeta, staticUnitMap)} alert={getAlertLevel(key, value, alertMap)} stale={stale} />
                            ))}
                          </div>
                        )
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="replay-empty">
          <p>{mode === 'trips' ? 'Select a trip above to begin replay.' : 'Set a time range and click Load.'}</p>
        </div>
      )}

      {modal === 'names' && (
        <InfoModal title="Units & Names" onClose={() => setModal(null)}>
          <table className="modal-table">
            <thead>
              <tr><th>Sensor</th><th>Short Name</th><th>Full Name</th><th>Unit</th></tr>
            </thead>
            <tbody>
              {ids.map(id => {
                const short = kpiMeta.shortNames[id]
                const full = kpiMeta.fullNames[id]
                const unit = kpiMeta.userUnits[id] ?? kpiMeta.defaultUnits[id] ?? ''
                return (
                  <tr key={id}>
                    <td className="modal-mono">{id}</td>
                    <td>{Array.isArray(short) ? short.find(s => !s.startsWith('ECU(')) ?? short[0] : short}</td>
                    <td>{Array.isArray(full) ? full.find(s => !s.startsWith('ECU(')) ?? full[0] : full}</td>
                    <td>{Array.isArray(unit) ? unit[0] : unit}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </InfoModal>
      )}
      {modal === 'profile' && (
        <InfoModal title="Vehicle Profile" onClose={() => setModal(null)}>
          <div className="profile-grid">
            {profileData.map(({ field, value }) => (
              <div key={field} className="profile-facet">
                <span className="profile-facet-label">{field}</span>
                <span className="profile-facet-value">{Array.isArray(value) ? value.join(', ') : String(value)}</span>
              </div>
            ))}
          </div>
        </InfoModal>
      )}
    </div>
  )
}
