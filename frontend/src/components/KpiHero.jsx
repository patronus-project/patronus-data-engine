import { useRef } from 'react'

function arcPath(cx, cy, r, startDeg, sweepDeg) {
  const toRad = d => (d * Math.PI) / 180
  const sx = cx + r * Math.cos(toRad(startDeg))
  const sy = cy + r * Math.sin(toRad(startDeg))
  const ex = cx + r * Math.cos(toRad(startDeg + sweepDeg))
  const ey = cy + r * Math.sin(toRad(startDeg + sweepDeg))
  const large = sweepDeg > 180 ? 1 : 0
  return `M ${sx.toFixed(2)} ${sy.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`
}

function GaugeDial({ label, value, max, unit, color }) {
  const cx = 50, cy = 56, r = 36
  const START = 135, SWEEP = 270
  const pct = Math.min(1, Math.max(0, (value || 0) / max))
  const track = arcPath(cx, cy, r, START, SWEEP)
  const fill  = pct > 0.005 ? arcPath(cx, cy, r, START, pct * SWEEP) : null
  return (
    <div className="gauge-wrap">
      <svg viewBox="0 0 100 88" style={{ width: '100%', maxWidth: 130 }}>
        <path d={track} fill="none" stroke="#ebebeb" strokeWidth="9" strokeLinecap="round" />
        {fill && <path d={fill} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" />}
        <text x={cx} y={cy - 4} textAnchor="middle" dominantBaseline="middle" fontSize="20" fontWeight="700" fill="#1a1a2e">
          {Math.round(value || 0)}
        </text>
        <text x={cx} y={cy + 13} textAnchor="middle" dominantBaseline="middle" fontSize="8.5" fill="#aaa">
          {unit}
        </text>
      </svg>
      <div className="gauge-label">{label}</div>
    </div>
  )
}

const TILE_KEYS = ['kff1226', 'kff1225', 'k4', 'k43', 'kd', 'kc']

const tiles = [
  { label: 'Horsepower',  key: 'kff1226', unit: 'hp' },
  { label: 'Torque',      key: 'kff1225', unit: 'Nm' },
  { label: 'Engine Load', key: 'k4',      unit: '%'  },
  { label: 'Load (Abs)',  key: 'k43',     unit: '%'  },
]

// kvm: { [kpiKey]: stringValue } — most-recent value map from caller
export default function KpiHero({ kvm }) {
  const lastSeen = useRef({})

  // Absorb any fresh numeric values into the sticky cache
  TILE_KEYS.forEach(key => {
    const v = parseFloat(kvm[key])
    if (!isNaN(v)) lastSeen.current[key] = v
  })

  const resolve = key => {
    const fresh = parseFloat(kvm[key])
    if (!isNaN(fresh)) return { value: Math.round(fresh), stale: false }
    const cached = lastSeen.current[key]
    if (cached != null) return { value: Math.round(cached), stale: true }
    return { value: '—', stale: false }
  }

  const speed = resolve('kd')
  const rpm   = resolve('kc')

  return (
    <div className="kpi-hero">
      <GaugeDial label="Speed (OBD)" value={speed.stale ? 0 : (speed.value === '—' ? 0 : speed.value)} max={200}  unit="km/h" color="#3498db" />
      <GaugeDial label="Engine RPM"  value={rpm.stale   ? 0 : (rpm.value   === '—' ? 0 : rpm.value)}   max={8000} unit="RPM"  color="#e67e22" />
      <div className="stat-boxes">
        {tiles.map(({ label, key, unit }) => {
          const { value, stale } = resolve(key)
          return (
            <div key={key} className="stat-box">
              <span className="stat-box-label">{label}</span>
              <span className={`stat-box-value${stale ? ' stale' : ''}`}>
                {value}<span className="stat-box-unit">{unit}</span>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
