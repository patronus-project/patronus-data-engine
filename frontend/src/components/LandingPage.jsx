import { useEffect, useState } from 'react'
import { Droplet, Cpu, Navigation, Zap, MapPin, Activity, BookOpen, Car, Rewind } from 'lucide-react'
import MapView from './MapView'
import KpiCard from './KpiCard'
import InfoModal from './InfoModal'
import { getTopKpis, getBreadcrumb, getKpiLabel, getKpiUnit, extractKpiMap } from './utils'
import KpiHero from './KpiHero'

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

const TABS = ['fuel', 'engine', 'trip', 'performance', 'gps', 'sensors']
const TAB_LABELS = { fuel: 'Fuel', engine: 'Engine', trip: 'Trip', performance: 'Perf', gps: 'GPS', sensors: 'Sensors' }
const TAB_ICONS  = { fuel: <Droplet size={16}/>, engine: <Cpu size={16}/>, trip: <Navigation size={16}/>, performance: <Zap size={16}/>, gps: <MapPin size={16}/>, sensors: <Activity size={16}/> }

export default function LandingPage({ history, keyMap, tabMap, kpiMeta, profileData, onSelectKpi, onRefresh, lastRefresh, lastData, onReplay }) {
  const topKpis = getTopKpis(history)
  const breadcrumb = getBreadcrumb(history)
  const heading = history.length > 0 ? parseFloat(extractKpiMap(history[0])['kff1007']) || 0 : 0

  const kvm = Object.fromEntries(topKpis.map(({ key, value }) => [key, value]))
  const [modal, setModal] = useState(null)
  const [activeTab, setActiveTab] = useState('fuel')

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
          <button className="header-action-btn" disabled title="Units &amp; Names"><BookOpen size={15} /></button>
          <button className="header-action-btn" disabled title="Vehicle Profile"><Car size={15} /></button>
          <button className="header-action-btn" onClick={onReplay} title="Replay" style={{ background: '#e74c3c', borderColor: '#e74c3c' }}><Rewind size={15} fill="#fff" stroke="#fff" /></button>
        </div>
      </div>
      <div className="landing">
        <div className="map-section">
          <MapView points={breadcrumb} heading={heading} />
        </div>
        <div className="kpi-section">
          {topKpis.length === 0 ? (
            <p className="no-data">No KPI data in history.</p>
          ) : (
            <>
              <div className="kpi-hero-pad"><KpiHero kvm={kvm} /></div>
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
                  {topKpis.filter(({ key }) => tabMap[key] === activeTab).length === 0 ? (
                    <p className="no-data">No {TAB_LABELS[activeTab]} data in current session.</p>
                  ) : (
                    <div className="kpi-grid">
                      {topKpis.filter(({ key }) => tabMap[key] === activeTab).map(({ key, value }) => (
                        <KpiCard key={key} kpiKey={key} label={getKpiLabel(key, kpiMeta, keyMap)}
                                 value={value} unit={getKpiUnit(key, kpiMeta)} onClick={() => onSelectKpi(key)} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      {modal === 'names' && <NamesModal kpiMeta={kpiMeta} onClose={() => setModal(null)} />}
      {modal === 'profile' && <ProfileModal profileData={profileData} onClose={() => setModal(null)} />}
    </div>
  )
}
