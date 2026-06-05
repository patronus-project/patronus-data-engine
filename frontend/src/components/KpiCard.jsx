import FormattedValue from './FormattedValue'

export default function KpiCard({ kpiKey, label, value, unit, onClick, alert, stale }) {
  return (
    <div className={`kpi-card${alert ? ` kpi-alert-${alert}` : ''}${stale ? ' kpi-stale' : ''}`} onClick={onClick} title={kpiKey}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value"><FormattedValue value={value} unit={unit} /></div>
    </div>
  )
}
