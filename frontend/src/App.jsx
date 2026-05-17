import { useState, useEffect, useCallback } from 'react'
import LandingPage from './components/LandingPage'
import KpiDetail from './components/KpiDetail'
import './App.css'

export default function App() {
  const [history, setHistory] = useState([])
  const [keyMap, setKeyMap] = useState({})
  const [selectedKpi, setSelectedKpi] = useState(null)
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
        const map = {}
        keysData.forEach(k => { map[k.id] = k.DeviceID })
        setKeyMap(map)
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

  if (selectedKpi) {
    return (
      <KpiDetail
        kpiKey={selectedKpi}
        label={keyMap[selectedKpi] || selectedKpi}
        history={history}
        onBack={() => setSelectedKpi(null)}
        onRefresh={fetchData}
      />
    )
  }

  const lastData = history.length > 0 ? new Date(history[0].receivedAt) : null

  return <LandingPage history={history} keyMap={keyMap} onSelectKpi={setSelectedKpi} onRefresh={fetchData} lastRefresh={lastRefresh} lastData={lastData} />
}
