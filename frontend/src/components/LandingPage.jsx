import { useEffect, useState } from 'react'
import MapView from './MapView'
import KpiCard from './KpiCard'
import InfoModal from './InfoModal'
import { getTopKpis, getBreadcrumb, getKpiLabel, getKpiUnit } from './utils'

function fmt(date) {
  return date ? date.toLocaleTimeString() : '—'
}

function NamesModal({ kpiMeta, onClose }) {
  const ids = [...new Set([
    ...Object.keys(kpiMeta.shortNames),
    ...Object.keys(kpiMeta.fullNames),
    ...Object.keys(kpiMeta.userUnits),
    ...Object.keys(kpiMeta.defaultUnits),
  ])].sort()

  return (
    <InfoModal title="Units & Names" onClose={onClose}>
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
                <td>{Array.isArray(short) ? short.filter(s => !s.startsWith('ECU('))[0] ?? short[0] : short}</td>
                <td>{Array.isArray(full) ? full.filter(s => !s.startsWith('ECU('))[0] ?? full[0] : full}</td>
                <td>{Array.isArray(unit) ? unit[0] : unit}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </InfoModal>
  )
}

function ProfileModal({ profileData, onClose }) {
  return (
    <InfoModal title="Vehicle Profile" onClose={onClose}>
      <div className="profile-grid">
        {profileData.map(({ field, value }) => (
          <div key={field} className="profile-facet">
            <span className="profile-facet-label">{field}</span>
            <span className="profile-facet-value">{Array.isArray(value) ? value.join(', ') : String(value)}</span>
          </div>
        ))}
      </div>
    </InfoModal>
  )
}

export default function LandingPage({ history, keyMap, kpiMeta, profileData, onSelectKpi, onRefresh, lastRefresh, lastData, onReplay }) {
  const topKpis = getTopKpis(history)
  const breadcrumb = getBreadcrumb(history)
  const [modal, setModal] = useState(null) // null | 'names' | 'profile'

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
          <button className="header-action-btn" onClick={() => setModal('names')}>Units &amp; Names</button>
          <button className="header-action-btn" onClick={() => setModal('profile')}>Profile</button>
          <button className="header-action-btn" onClick={onReplay}>⏮ Replay</button>
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
                  label={getKpiLabel(key, kpiMeta, keyMap)}
                  value={value}
                  unit={getKpiUnit(key, kpiMeta)}
                  onClick={() => onSelectKpi(key)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      {modal === 'names' && <NamesModal kpiMeta={kpiMeta} onClose={() => setModal(null)} />}
      {modal === 'profile' && <ProfileModal profileData={profileData} onClose={() => setModal(null)} />}
    </div>
  )
}
