import { useState, useEffect, useCallback } from 'react'
import LandingPage from './components/LandingPage'
import KpiDetail from './components/KpiDetail'
import ReplayPage from './components/ReplayPage'
import { getKpiMeta, getProfileData } from './components/utils'
import './App.css'

export default function App() {
  const [history, setHistory] = useState([])
  const [keyMap, setKeyMap] = useState({})
  const [tabMap, setTabMap] = useState({})
  const [staticUnitMap, setStaticUnitMap] = useState({})
  const [kpiMeta, setKpiMeta] = useState({ defaultUnits: {}, userUnits: {}, shortNames: {}, fullNames: {} })
  const [profileData, setProfileData] = useState([])
  const [selectedKpi, setSelectedKpi] = useState(null)
  const [view, setView] = useState('live') // 'live' | 'replay'
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastRefresh, setLastRefresh] = useState(null)

  const fetchData = useCallback(() => {
    return Promise.all([
      fetch('/api/obd2/history').then(r => r.json()),
      fetch('/api/keys').then(r => r.json()),
    ])
      .then(([historyData, keysData]) => {
        setHistory(historyData)
        setKpiMeta(getKpiMeta(historyData))
        setProfileData(getProfileData(historyData))
        const map = {}, tmap = {}, umap = {}
        keysData.forEach(k => {
          map[k.id] = k.DeviceID
          if (k.tab)  tmap[k.id] = k.tab
          if (k.unit) umap[k.id] = k.unit
        })
        setKeyMap(map)
        setTabMap(tmap)
        setStaticUnitMap(umap)
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
    return <ReplayPage history={history} keyMap={keyMap} tabMap={tabMap} staticUnitMap={staticUnitMap} kpiMeta={kpiMeta} profileData={profileData} onExit={() => setView('live')} />
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

  return <LandingPage history={history} keyMap={keyMap} tabMap={tabMap} staticUnitMap={staticUnitMap} kpiMeta={kpiMeta} profileData={profileData} onSelectKpi={setSelectedKpi} onRefresh={fetchData} lastRefresh={lastRefresh} lastData={lastData} onReplay={() => setView('replay')} />
}
