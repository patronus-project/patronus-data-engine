import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { Droplet, Cpu, Navigation, Zap, MapPin, Activity, BookOpen, Car, Radio, CircleHelp, Satellite } from 'lucide-react'
import { useTrips } from '../hooks/useTrips'
import { useReplayStream } from '../hooks/useReplayStream'
import { formatDateShort, extractKpiMap, getPathPoints, getExtPathPoints, getTrackPoints, getKpiLabel, getKpiUnit, getAlertLevel, buildExtMap, getExtSyncTs, getExtSpeedKmh } from './utils'
import { useExtGpsToggle } from '../hooks/useExtGpsToggle'
import { useTripDays } from '../hooks/useTripDays'
import { useTripProgress } from '../hooks/useTripProgress'
import { dayInfoAt, SHORT_BREAK_MS } from './tripDays'
import { tripKey, showTripInUrl } from './shareLink'
import KpiHero from './KpiHero'
import InfoModal from './InfoModal'
import TripSummaryModal from './summary/TripSummaryModal'
import TripSelector from './TripSelector'
import ReplayHeader from './ReplayHeader'
import ReplayControls from './ReplayControls'
import MapView from './MapView'
import KpiCard from './KpiCard'

const TABS = ['fuel', 'engine', 'trip', 'performance', 'gps', 'sensors', 'misc', 'extgps']
const TAB_LABELS = { fuel: 'Fuel', engine: 'Engine', trip: 'Trip', performance: 'Perf', gps: 'GPS', sensors: 'Sensors', misc: 'Unknown', extgps: 'Ext' }
const TAB_ICONS  = { fuel: <Droplet size={16}/>, engine: <Cpu size={16}/>, trip: <Navigation size={16}/>, performance: <Zap size={16}/>, gps: <MapPin size={16}/>, sensors: <Activity size={16}/>, misc: <CircleHelp size={16}/>, extgps: <Satellite size={16}/> }

// On a phone, Play scrolls so the map's centre sits this far down the screen (0 = top, 1 = bottom)
const MAP_CENTRE_FROM_TOP = 0.5

// Track mode on the map shows this many of the most recent frames, one dot per data point
const TRACK_WINDOW = 600

// UTC calendar day (YYYY-MM-DD) of an ISO time — the same day basis the trip list's date filter uses
const dayOf = (iso) => new Date(iso).toISOString().slice(0, 10)

// A shared link naming a time range opens as a pseudo-trip (no saved details); a saved-trip link is fetched below
const rangeTrip = (link) => ({ tripId: null, startTime: link.start, endTime: link.end, durationMs: new Date(link.end) - new Date(link.start), recordCount: null })

export default function ReplayPage({ keyMap, tabMap, staticUnitMap, alertMap, kpiMeta, profileData, onExit, initialLink }) {
  const [mode, setMode] = useState('trips')
  const [selectorCollapsed, setSelectorCollapsed] = useState(false)
  const mapSectionRef = useRef(null)
  const focusMapPending = useRef(false)   // a phone asked to focus the map before there was any KPI content to scroll through
  const [modal, setModal] = useState(null) // null | 'names' | 'profile' | 'summary'

  // Trips mode state
  // Landing on a shared link lists trips from the linked trip's start day through today
  const { trips, loading: tripsLoading, dateFrom, dateTo, setDateFrom, setDateTo } = useTrips(initialLink && initialLink.start ? dayOf(initialLink.start) : undefined)
  const [selectedTrip, setSelectedTrip] = useState(() => (initialLink && initialLink.start ? rangeTrip(initialLink) : null))
  const [linkError, setLinkError] = useState(null)

  // Shared link to a saved trip: fetch it so its name, description and bounds are known
  useEffect(() => {
    if (!initialLink || !initialLink.trip) return
    fetch(`/api/trips/saved/${initialLink.trip}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(r.status === 404 ? 'This shared trip no longer exists.' : `Could not load the shared trip (HTTP ${r.status}).`))))
      .then(trip => { setSelectedTrip(trip); setDateFrom(dayOf(trip.startTime)) })
      .catch(err => setLinkError(err.message))
  }, [initialLink, setDateFrom])

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
    currentRecord, extMap, play, pause, seek, setSpeed,
  } = useReplayStream(source)

  // The timeline gives every frame's time up front, so the day shows even while a far seek is still buffering
  const { days, times, clocks } = useTripDays(source)
  const frameMs = times[frame] ?? (currentRecord ? new Date(currentRecord.receivedAt).getTime() : null)
  const startMs = source ? new Date(source.start).getTime() : null
  const endMs = source ? new Date(source.end).getTime() : null
  // A trip too short to have fetched its timeline is one day ("1 of 1") and, being under a break long, has no breaks
  const dayInfo = useMemo(
    () => dayInfoAt(days, frameMs) ?? (frameMs != null && startMs != null ? { index: 1, total: 1 } : null),
    [days, frameMs, startMs]
  )
  const tooShortForBreaks = startMs != null && endMs - startMs < SHORT_BREAK_MS
  const tripTimeMs = clocks.tripTimeMs[frame] ?? (tooShortForBreaks && frameMs != null ? Math.max(0, frameMs - startMs) : null)
  const lastBreakMs = clocks.lastBreakMs[frame] ?? null
  const totalTripMs = clocks.tripTimeMs.length ? clocks.tripTimeMs[clocks.tripTimeMs.length - 1] : (tooShortForBreaks ? endMs - startMs : null)

  const currentKpiMap = useMemo(() => currentRecord ? extractKpiMap(currentRecord) : {}, [currentRecord])

  const [activeTab, setActiveTab] = useState('fuel')

  const [forceObd, toggleObdOverride, forceExt, toggleExtOverride] = useExtGpsToggle()
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

  const extGpsEntries = useMemo(() => {
    if (!currentRecord?.time) return []
    const syncTs = getExtSyncTs(currentRecord.time)
    const extDoc = syncTs != null ? extMap.get(syncTs) : null
    const extGps = extDoc?.extGps ?? {}
    return Object.entries(extGps).filter(([k]) => k !== 'ts')
  }, [currentRecord, extMap])

  const extGpsSpeedKmh = useMemo(() => getExtSpeedKmh(currentRecord, extMap), [currentRecord, extMap])

  const mapPoints = useMemo(() => {
    if (records.length === 0) return []
    const slice = records.slice(0, frame + 1)
    if (!forceObd) {
      const extPoints = getExtPathPoints(slice, extMap)
      if (forceExt || extPoints.length > 0) return extPoints
    }
    return getPathPoints(slice)
  }, [records, frame, forceObd, forceExt, extMap])

  const displayedSource = useMemo(() => {
    if (forceExt) return 'ext'
    if (forceObd || records.length === 0) return 'obd'
    const slice = records.slice(0, frame + 1)
    return getExtPathPoints(slice, extMap).length > 0 ? 'ext' : 'obd'
  }, [records, frame, forceObd, forceExt, extMap])

  // Track mode: a rolling window of the latest frames at full resolution, moving in step with the playhead
  const trackOffset = Math.max(0, frame + 1 - TRACK_WINDOW)
  const trackPoints = useMemo(
    () => (records.length === 0 ? [] : getTrackPoints(records.slice(trackOffset, frame + 1), displayedSource === 'ext' ? extMap : null)),
    [records, frame, trackOffset, displayedSource, extMap]
  )

  const progress = useTripProgress({ records, extMap, frame, tripTimeMs, totalTripMs })

  const heading = useMemo(() => {
    if (displayedSource === 'ext' && currentRecord?.time) {
      const syncTs = getExtSyncTs(currentRecord.time)
      const dir = parseFloat(extMap.get(syncTs)?.extGps?.dir)
      if (!isNaN(dir)) return dir
    }
    return parseFloat(currentKpiMap['kff1007']) || 0
  }, [displayedSource, currentRecord, extMap, currentKpiMap])

  // Scrolls the page so the map's centre sits half way down the screen: the trip stats above it stay partly in
  // view, the headline KPIs and the first KPI cards show below it.
  const scrollToMap = useCallback(() => {
    // two frames: let any layout change (the picker folding away, KPIs appearing) settle before measuring where the map is
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const map = mapSectionRef.current
      if (!map) return
      const rect = map.getBoundingClientRect()
      const centre = window.scrollY + rect.top + rect.height / 2
      window.scrollTo({ top: Math.max(0, centre - window.innerHeight * MAP_CENTRE_FROM_TOP), behavior: 'smooth' })
    }))
  }, [])

  // The page is only as tall as its content, and the KPI section is empty until the first record with sensor values
  // arrives (frame 0 is often just a metadata ping), so on a phone the scroll waits for it rather than being clamped short.
  useEffect(() => {
    if (focusMapPending.current && currentKpis.length > 0) {
      focusMapPending.current = false
      scrollToMap()
    }
  }, [currentKpis.length, scrollToMap])

  // Starting playback folds the trip picker away; on a phone it also brings the map into focus
  function handlePlay() {
    setSelectorCollapsed(true)
    play()
    if (!window.matchMedia('(max-width: 768px)').matches) return
    if (currentKpis.length > 0) scrollToMap()
    else focusMapPending.current = true
  }

  function handleModeChange(next) {
    setMode(next)
    setSelectedTrip(null)
    setActiveCustom(null)
    setLinkError(null)
    showTripInUrl(null)
  }

  function handleSelectTrip(trip) {
    setSelectedTrip(trip)
    setLinkError(null)
    showTripInUrl(trip)
  }

  function handleLoadCustom() {
    if (customStart && customEnd) {
      // datetime-local has no zone: convert here, in the browser's zone, so the range (and its link) is unambiguous
      const range = { start: new Date(customStart).toISOString(), end: new Date(customEnd).toISOString() }
      setActiveCustom(range)
      showTripInUrl({ startTime: range.start, endTime: range.end })
    }
  }

  // Summary object ReplayHeader expects
  const tripSummary = useMemo(() => {
    if (mode === 'trips' && selectedTrip) {
      return {
        startTime: new Date(selectedTrip.startTime),
        endTime: new Date(selectedTrip.endTime),
        durationMs: selectedTrip.durationMs,
        recordCount: selectedTrip.recordCount ?? total,
        savedTripId: selectedTrip.savedTripId,
        name: selectedTrip.name,
        description: selectedTrip.description,
        tags: selectedTrip.tags,
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

  // What the collapsed picker bar says: the selected trip's name, or its dates
  const selectorSummary = !tripSummary
    ? (mode === 'trips' ? 'Select a trip' : 'Pick a time range')
    : (tripSummary.name || `${formatDateShort(tripSummary.startTime)} → ${formatDateShort(tripSummary.endTime)}`)

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
          ><MapPin size={15} /></button>
          <button
            className="header-action-btn"
            onClick={toggleExtOverride}
            title={forceExt ? 'Forced Ext GPS — click to use best available' : 'Auto GPS — click to force Ext GPS'}
            style={forceExt ? { background: '#c0392b', borderColor: '#c0392b' } : {}}
          ><Satellite size={15} /></button>
          <button className="header-action-btn" onClick={onExit} title="Back to Live"><Radio size={15} /></button>
        </div>
      </div>

      <TripSelector
        collapsed={selectorCollapsed}
        onToggleCollapsed={() => setSelectorCollapsed(c => !c)}
        summaryText={selectorSummary}
        mode={mode}
        onModeChange={handleModeChange}
        trips={trips}
        tripsLoading={tripsLoading}
        selectedKey={selectedTrip ? tripKey(selectedTrip) : null}
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
          <ReplayHeader trip={tripSummary} frame={frame} total={total} frameMs={frameMs} dayInfo={dayInfo} tripTimeMs={tripTimeMs} lastBreakMs={lastBreakMs} progress={progress} onOpenSummary={() => setModal('summary')} />
          <ReplayControls
            playing={playing}
            frame={frame}
            total={total}
            speed={speed}
            buffering={buffering}
            onPlay={handlePlay}
            onPause={pause}
            onSeek={seek}
            onSpeedChange={setSpeed}
          />
          <div className="landing">
            <div className="map-section" ref={mapSectionRef}>
              <MapView points={mapPoints} trackPoints={trackPoints} trackOffset={trackOffset} showTrackLine={!playing} heading={heading} />
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
                  <div className="kpi-hero-pad"><KpiHero kvm={currentKpiMap} extGpsSpeedKmh={extGpsSpeedKmh} /></div>
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
          <p>{linkError || (mode === 'trips' ? 'Select a trip above to begin replay.' : 'Set a time range and click Load.')}</p>
        </div>
      )}

      {modal === 'summary' && selectedTrip && selectedTrip.savedTripId && (
        <TripSummaryModal tripId={selectedTrip.savedTripId} title={selectedTrip.name} onClose={() => setModal(null)} />
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
