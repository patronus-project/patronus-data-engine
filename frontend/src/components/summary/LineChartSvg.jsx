import { useState } from 'react'
import { useElementWidth } from '../../hooks/useElementWidth'

const PAD = { left: 42, right: 10, top: 8, bottom: 20 }
const X_TICKS = 4
const Y_TICKS = 3

const round = (n) => Math.round(n * 100) / 100

// series: [[x, y], ...] ascending in x. readout(x, y) → text shown while pointing at the chart.
// hlines: [{ y, color }] reference lines (e.g. coolant limits). marks: [x] vertical dashed lines (e.g. day boundaries).
const LineChartSvg = ({ series, height = 160, color = '#3b82f6', yFloor, xLabel, yLabel = (y) => String(round(y)), readout, hlines = [], marks = [], fill = true }) => {
  const [ref, width] = useElementWidth()
  const [at, setAt] = useState(null)
  if (!series || series.length < 2) return <div className="ts-chart-empty">No data for this chart</div>

  const xs = series.map((p) => p[0])
  const ys = [...series.map((p) => p[1]), ...hlines.map((h) => h.y)]
  const x0 = xs[0]
  const x1 = xs[xs.length - 1]
  const lo = yFloor !== undefined ? Math.min(yFloor, ...ys) : Math.min(...ys)
  const hi = Math.max(...ys)
  const span = Math.max(hi - lo, 1e-6)
  const yMin = yFloor !== undefined ? lo : lo - span * 0.05
  const yMax = hi + span * 0.08
  const w = Math.max(width - PAD.left - PAD.right, 1)
  const h = height - PAD.top - PAD.bottom
  const X = (x) => PAD.left + ((x - x0) / Math.max(x1 - x0, 1)) * w
  const Y = (y) => PAD.top + (1 - (y - yMin) / (yMax - yMin)) * h
  const line = series.map(([x, y], i) => `${i ? 'L' : 'M'}${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(' ')
  const area = `${line} L${X(x1).toFixed(1)},${Y(yMin).toFixed(1)} L${X(x0).toFixed(1)},${Y(yMin).toFixed(1)} Z`
  const yTicks = Array.from({ length: Y_TICKS + 1 }, (_, i) => yMin + ((yMax - yMin) * i) / Y_TICKS)
  const xTicks = Array.from({ length: X_TICKS + 1 }, (_, i) => x0 + ((x1 - x0) * i) / X_TICKS)

  const point = at === null ? null : series[at]
  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = x0 + ((e.clientX - rect.left - PAD.left) / w) * (x1 - x0)
    let best = 0
    xs.forEach((v, i) => { if (Math.abs(v - x) < Math.abs(xs[best] - x)) best = i })
    setAt(best)
  }

  return (
    <div ref={ref} className="ts-chart">
      <div className="ts-readout">{point ? (readout ? readout(point[0], point[1]) : `${xLabel(point[0])} · ${yLabel(point[1])}`) : 'Point at the chart to read it'}</div>
      {width > 0 && (
        <svg width={width} height={height} onPointerMove={onMove} onPointerLeave={() => setAt(null)} role="img">
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={PAD.left + w} y1={Y(t)} y2={Y(t)} className="ts-grid" />
              <text x={PAD.left - 6} y={Y(t) + 3} textAnchor="end" className="ts-axis">{yLabel(t)}</text>
            </g>
          ))}
          {xTicks.map((t, i) => (
            <text key={t} x={X(t)} y={height - 5} textAnchor={i === 0 ? 'start' : i === X_TICKS ? 'end' : 'middle'} className="ts-axis">{xLabel(t)}</text>
          ))}
          {marks.map((m) => <line key={m} x1={X(m)} x2={X(m)} y1={PAD.top} y2={PAD.top + h} className="ts-mark" />)}
          {hlines.map((l) => <line key={l.y} x1={PAD.left} x2={PAD.left + w} y1={Y(l.y)} y2={Y(l.y)} stroke={l.color} strokeWidth="1" strokeDasharray="4 3" />)}
          {fill && <path d={area} fill={color} opacity="0.12" />}
          <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
          {point && (
            <g>
              <line x1={X(point[0])} x2={X(point[0])} y1={PAD.top} y2={PAD.top + h} className="ts-cursor" />
              <circle cx={X(point[0])} cy={Y(point[1])} r="4" fill={color} stroke="#fff" strokeWidth="2" />
            </g>
          )}
        </svg>
      )}
    </div>
  )
}

export default LineChartSvg
