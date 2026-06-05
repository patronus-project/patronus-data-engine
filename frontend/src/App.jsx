import { useState, useEffect, useCallback, useMemo } from 'react'
import LandingPage from './components/LandingPage'
import KpiDetail from './components/KpiDetail'
import ReplayPage from './components/ReplayPage'
import { getKpiMeta, getProfileData, buildExtMap } from './components/utils'
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
  const [lastRefresh, setLastRefresh] = useState(null)

  const extMap = useMemo(() => buildExtMap(extHistory), [extHistory])
  const [forceObd, toggleObdOverride] = useExtGpsToggle()
  const evaluator = useGpsEvaluator(history, extMap)
  const activeSource = forceObd ? 'torque' : evaluator.source
  const gpsWarning = forceObd && evaluator.reason === 'torque-frozen'
    ? 'OBD GPS is frozen — consider disabling the OBD override'
    : !forceObd && evaluator.reason === 'ext-frozen'
    ? 'Ext GPS is frozen — switching to OBD GPS'
    : null

  const fetchData = useCallback(() => {
    return Promise.all([
      fetch('/api/obd2/history').then(r => r.json()),
      fetch('/api/keys').then(r => r.json()),
      fetch('/api/obd2/ext-history').then(r => r.json()),
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
        setLastRefresh(new Date())
        setLoading(false)
      })
      .catch(err => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) return <div className="state-msg">Loading...</div>
  if (error) return <div className="state-msg error">Error: {error}</div>

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

  return <LandingPage history={history} extMap={extMap} activeSource={activeSource} forceObd={forceObd} onToggleObdOverride={toggleObdOverride} gpsWarning={gpsWarning} keyMap={keyMap} tabMap={tabMap} staticUnitMap={staticUnitMap} alertMap={alertMap} kpiMeta={kpiMeta} profileData={profileData} onSelectKpi={setSelectedKpi} onRefresh={fetchData} lastRefresh={lastRefresh} lastData={lastData} onReplay={() => setView('replay')} />
}
