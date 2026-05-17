import { useEffect } from 'react'
import MapView from './MapView'
import KpiCard from './KpiCard'
import { getTopKpis, getBreadcrumb } from './utils'

function fmt(date) {
  return date ? date.toLocaleTimeString() : '—'
}

export default function LandingPage({ history, keyMap, onSelectKpi, onRefresh, lastRefresh, lastData }) {
  const topKpis = getTopKpis(history)
  const breadcrumb = getBreadcrumb(history)

  useEffect(() => {
    const id = setInterval(onRefresh, 10000)
    return () => clearInterval(id)
  }, [onRefresh])

  return (
    <div className="page-wrapper">
      <div className="app-header">
        <span>Patronus — Live Telemetry</span>
        <div className="ts-bar">
          <span>Refreshed: {fmt(lastRefresh)}</span>
          <span>Last data: {fmt(lastData)}</span>
        </div>
      </div>
      <div className="landing">
        <div className="map-section">
          <MapView points={breadcrumb} />
        </div>
        <div className="kpi-section">
          {topKpis.length === 0 ? (
            <p className="no-data">No KPI data in history.</p>
          ) : (
            <div className="kpi-grid">
              {topKpis.map(({ key, value }) => (
                <KpiCard
                  key={key}
                  kpiKey={key}
                  label={keyMap[key] || key}
                  value={value}
                  onClick={() => onSelectKpi(key)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
