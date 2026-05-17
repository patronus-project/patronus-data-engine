import FormattedValue from './FormattedValue'

export default function KpiCard({ kpiKey, label, value, onClick }) {
  return (
    <div className="kpi-card" onClick={onClick} title={kpiKey}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value"><FormattedValue value={value} /></div>
    </div>
  )
}
