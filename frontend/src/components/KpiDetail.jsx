import { getKpiHistory, getKpiLabel, getKpiUnit } from './utils'
import FormattedValue from './FormattedValue'

export default function KpiDetail({ kpiKey, history, keyMap, kpiMeta, onBack, onRefresh }) {
  const entries = getKpiHistory(history, kpiKey)
  const label = getKpiLabel(kpiKey, kpiMeta, keyMap)
  const unit = getKpiUnit(kpiKey, kpiMeta)

  return (
    <div className="page-wrapper">
      <div className="app-header">Patronus — Live Telemetry</div>
      <div className="detail-page">
        <div className="detail-actions">
          <button className="back-btn" onClick={onBack}>← Back</button>
          <button className="refresh-btn" onClick={onRefresh}>↻ Refresh</button>
        </div>
        <div className="detail-title">{label}{unit ? <span className="kpi-unit"> ({unit})</span> : null}</div>
        <div className="detail-key">{kpiKey}</div>

        {entries.length === 0 ? (
          <p className="no-data">No history for this KPI.</p>
        ) : (
          <table className="history-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Value</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td><FormattedValue value={entry.value} unit={unit} /></td>
                  <td>{entry.receivedAt ? new Date(entry.receivedAt).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
