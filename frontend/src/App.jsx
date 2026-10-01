import { useState, useEffect, useCallback, useMemo } from 'react'
import LandingPage from './components/LandingPage'
import KpiDetail from './components/KpiDetail'
import ReplayPage from './components/ReplayPage'
import { getKpiMeta, getProfileData, buildExtMap, fetchJsonArray } from './components/utils'
import { useGpsEvaluator } from './hooks/useGpsEvaluator'
import { useExtGpsToggle } from './hooks/useExtGpsToggle'
import './App.css'

export default function App() {
  const [history, setHistory] = useState([])
  const [extHistory, setExtHistory] = useState([])
  const [keyMap, setKeyMap] = useState({})
  const [tabMap, setTabMap] = useState({})
  const [staticUnitMap, setStaticUnitMap] = useState({})
  const [alertMap, setAlertMap] = useState({})
  const [kpiMeta, setKpiMeta] = useState({ defaultUnits: {}, userUnits: {}, shortNames: {}, fullNames: {} })
  const [profileData, setProfileData] = useState([])
  const [selectedKpi, setSelectedKpi] = useState(null)
  const [view, setView] = useState('live') // 'live' | 'replay'
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // Once any poll has succeeded, a later failure keeps the last good data on screen instead of the error page
  const [hasLoaded, setHasLoaded] = useState(false)

  const extMap = useMemo(() => buildExtMap(extHistory), [extHistory])
  const [forceObd, toggleObdOverride, forceExt, toggleExtOverride] = useExtGpsToggle()
  const evaluator = useGpsEvaluator(history, extMap)
  const activeSource = forceObd ? 'torque' : forceExt ? 'ext' : evaluator.source
  const gpsWarning = forceExt && (evaluator.reason === 'both-unavailable' || evaluator.reason === 'ext-frozen' || evaluator.reason === 'ext-no-data' || evaluator.reason === 'ext-no-speed-samples')
    ? 'Ext GPS is unavailable/frozen — consider disabling the Ext GPS override'
    : evaluator.reason === 'both-unavailable'
    ? 'GPS reliability issue: Ext GPS missing and OBD GPS appears frozen — using OBD fallback'
    : forceObd && (evaluator.reason === 'torque-frozen' || evaluator.reason === 'torque-no-data')
    ? 'OBD GPS is unavailable/frozen — consider disabling the OBD override'
    : !forceObd && !forceExt && (evaluator.reason === 'ext-frozen' || evaluator.reason === 'ext-no-data' || evaluator.reason === 'ext-no-speed-samples')
    ? 'Ext GPS is unavailable/frozen — switching to OBD GPS'
    : null

  const fetchData = useCallback(() => {
    return Promise.all([
      fetchJsonArray('/api/obd2/history'),
      fetchJsonArray('/api/keys'),
      fetchJsonArray('/api/obd2/ext-history'),
    ])
      .then(([historyData, keysData, extData]) => {
        setHistory(historyData)
        setExtHistory(extData)
        setKpiMeta(getKpiMeta(historyData))
        setProfileData(getProfileData(historyData))
        const map = {}, tmap = {}, umap = {}, amap = {}
        keysData.forEach(k => {
          map[k.id] = k.DeviceID
          if (k.tab)    tmap[k.id] = k.tab
          if (k.unit)   umap[k.id] = k.unit
          if (k.alerts) amap[k.id] = k.alerts
        })
        setKeyMap(map)
        setTabMap(tmap)
        setStaticUnitMap(umap)
        setAlertMap(amap)
        setError(null)
        setHasLoaded(true)
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // First load failed: AutoRefreshBar isn't mounted yet, so retry here on the base poll cadence
  useEffect(() => {
    if (!error || hasLoaded) return
    const id = setInterval(fetchData, 10000)
    return () => clearInterval(id)
  }, [error, hasLoaded, fetchData])

  if (loading) return <div className="state-msg">Loading...</div>
  if (error && !hasLoaded) return <div className="state-msg error">Error: {error} — retrying every 10s</div>

  if (view === 'replay') {
    return <ReplayPage history={history} keyMap={keyMap} tabMap={tabMap} staticUnitMap={staticUnitMap} alertMap={alertMap} kpiMeta={kpiMeta} profileData={profileData} onExit={() => setView('live')} />
  }

  if (selectedKpi) {
    return (
      <KpiDetail
        kpiKey={selectedKpi}
        history={history}
        keyMap={keyMap}
        kpiMeta={kpiMeta}
        onBack={() => setSelectedKpi(null)}
        onRefresh={fetchData}
      />
    )
  }

  const lastData = history.length > 0 ? new Date(history[0].receivedAt) : null

  return <LandingPage history={history} extMap={extMap} activeSource={activeSource} forceObd={forceObd} forceExt={forceExt} onToggleObdOverride={toggleObdOverride} onToggleExtOverride={toggleExtOverride} gpsWarning={gpsWarning} pollError={error} keyMap={keyMap} tabMap={tabMap} staticUnitMap={staticUnitMap} alertMap={alertMap} kpiMeta={kpiMeta} profileData={profileData} onSelectKpi={setSelectedKpi} onRefresh={fetchData} lastData={lastData} onReplay={() => setView('replay')} />
}
