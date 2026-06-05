import { useEffect, useState, useMemo } from 'react'
import { Droplet, Cpu, Navigation, Zap, MapPin, Activity, BookOpen, Car, Rewind, CircleHelp, Satellite } from 'lucide-react'
import MapView from './MapView'
import KpiCard from './KpiCard'
import InfoModal from './InfoModal'
import { getTopKpis, getBreadcrumb, getExtBreadcrumb, getKpiLabel, getKpiUnit, extractKpiMap, getAlertLevel, getExtSyncTs } from './utils'
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

const TABS = ['fuel', 'engine', 'trip', 'performance', 'gps', 'sensors', 'misc', 'extgps']
const TAB_LABELS = { fuel: 'Fuel', engine: 'Engine', trip: 'Trip', performance: 'Perf', gps: 'GPS', sensors: 'Sensors', misc: 'Unknown', extgps: 'Ext' }
const TAB_ICONS  = { fuel: <Droplet size={16}/>, engine: <Cpu size={16}/>, trip: <Navigation size={16}/>, performance: <Zap size={16}/>, gps: <MapPin size={16}/>, sensors: <Activity size={16}/>, misc: <CircleHelp size={16}/>, extgps: <Satellite size={16}/> }

export default function LandingPage({ history, extMap, activeSource, forceObd, onToggleObdOverride, gpsWarning, keyMap, tabMap, staticUnitMap, alertMap, kpiMeta, profileData, onSelectKpi, onRefresh, lastRefresh, lastData, onReplay }) {
  const topKpis = getTopKpis(history)

  const extBreadcrumb = useMemo(() => getExtBreadcrumb(history, extMap), [history, extMap])
  const obdBreadcrumb = useMemo(() => getBreadcrumb(history), [history])
  const breadcrumb      = activeSource === 'ext' && extBreadcrumb.length > 0 ? extBreadcrumb : obdBreadcrumb
  const displayedSource = activeSource === 'ext' && extBreadcrumb.length > 0 ? 'ext' : 'obd'

  const heading = useMemo(() => {
    if (displayedSource === 'ext' && history.length > 0) {
      const syncTs = getExtSyncTs(history[0].time)
      const dir = parseFloat(extMap?.get(syncTs)?.extGps?.dir)
      if (!isNaN(dir)) return dir
    }
    return history.length > 0 ? parseFloat(extractKpiMap(history[0])['kff1007']) || 0 : 0
  }, [displayedSource, history, extMap])

  const kvm = Object.fromEntries(topKpis.map(({ key, value }) => [key, value]))
  const [modal, setModal] = useState(null)
  const [activeTab, setActiveTab] = useState('fuel')

  const extGpsEntries = useMemo(() => {
    if (!history.length || !history[0].time) return []
    const syncTs = getExtSyncTs(history[0].time)
    const extDoc = syncTs != null ? extMap?.get(syncTs) : null
    const extGps = extDoc?.extGps ?? {}
    return Object.entries(extGps).filter(([k]) => k !== 'ts')
  }, [history, extMap])

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
          <button
            className="header-action-btn"
            onClick={onToggleObdOverride}
            title={forceObd ? 'Forced OBD GPS — click to let smart logic decide' : 'Smart GPS active — click to force OBD'}
            style={forceObd ? { background: '#e67e22', borderColor: '#e67e22' } : {}}
          ><Satellite size={15} /></button>
          <button className="header-action-btn" onClick={onReplay} title="Replay" style={{ background: '#e74c3c', borderColor: '#e74c3c' }}><Rewind size={15} fill="#fff" stroke="#fff" /></button>
        </div>
      </div>
      {gpsWarning && (
        <div className="gps-warning-bar">
          <Satellite size={13} /> {gpsWarning}
        </div>
      )}
      <div className="landing">
        <div className="map-section">
          <MapView points={breadcrumb} heading={heading} />
          <div className={`map-source-badge ${displayedSource}`}>
            {displayedSource === 'ext' ? 'Ext GPS' : 'OBD GPS'}
          </div>
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
                  {activeTab === 'gps' && displayedSource === 'ext' && (
                    <div className="ext-active-toast"><Satellite size={11} /> Ext GPS Active</div>
                  )}
                  {activeTab === 'extgps' && displayedSource === 'obd' && (
                    <div className="ext-active-toast obd"><MapPin size={11} /> OBD GPS Active</div>
                  )}
                  {activeTab === 'extgps' ? (
                    extGpsEntries.length === 0
                      ? <p className="no-data">No Ext GPS data available.</p>
                      : <div className="kpi-grid">
                          {extGpsEntries.map(([k, v]) => (
                            <KpiCard key={k} kpiKey={k} label={keyMap[k] || k} value={String(v)} unit={staticUnitMap[k] || ''} />
                          ))}
                        </div>
                  ) : (
                    topKpis.filter(({ key }) => activeTab === 'misc' ? !tabMap[key] : tabMap[key] === activeTab).length === 0 ? (
                      <p className="no-data">No {TAB_LABELS[activeTab]} data in current session.</p>
                    ) : (
                      <div className="kpi-grid">
                        {topKpis.filter(({ key }) => activeTab === 'misc' ? !tabMap[key] : tabMap[key] === activeTab).map(({ key, value }) => (
                          <KpiCard key={key} kpiKey={key} label={getKpiLabel(key, kpiMeta, keyMap)}
                                   value={value} unit={getKpiUnit(key, kpiMeta, staticUnitMap)}
                                   alert={getAlertLevel(key, value, alertMap)} onClick={() => onSelectKpi(key)} />
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
      {modal === 'names' && <NamesModal kpiMeta={kpiMeta} onClose={() => setModal(null)} />}
      {modal === 'profile' && <ProfileModal profileData={profileData} onClose={() => setModal(null)} />}
    </div>
  )
}
