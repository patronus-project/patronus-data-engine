// Two small bar charts built from plain elements (they size themselves and wrap text on a phone).

// Horizontal bars with the value in text beside each: items [{ label, value, display, sub }]
export const HBars = ({ items, color = '#3b82f6' }) => {
  const max = Math.max(...items.map((i) => i.value || 0), 1e-9)
  return (
    <div className="ts-hbars">
      {items.map((item) => (
        <div key={item.label} className="ts-hbar-row">
          <span className="ts-hbar-label">{item.label}</span>
          <span className="ts-hbar-track">
            <span className="ts-hbar-fill" style={{ width: `${((item.value || 0) / max) * 100}%`, background: color }} />
          </span>
          <span className="ts-hbar-value">{item.display}{item.sub && <small>{item.sub}</small>}</span>
        </div>
      ))}
    </div>
  )
}

// Vertical columns, e.g. 24 hours of the day: items [{ label, value, title }]; labelEvery thins the x labels
export const Columns = ({ items, color = '#3b82f6', height = 110, labelEvery = 1 }) => {
  const max = Math.max(...items.map((i) => i.value || 0), 1e-9)
  return (
    <div className="ts-cols" style={{ height }}>
      {items.map((item, i) => (
        <div key={item.label} className="ts-col" title={item.title}>
          <span className="ts-col-bar" style={{ height: `${((item.value || 0) / max) * 100}%`, background: color }} />
          <span className="ts-col-label">{i % labelEvery === 0 ? item.label : ''}</span>
        </div>
      ))}
    </div>
  )
}
