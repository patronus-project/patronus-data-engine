import { useElementWidth } from '../../hooks/useElementWidth'
import { SPEED_COLOURS } from './speedColours'

const HEIGHT = 340
const PAD = 16

const colourOf = (kmh) => (kmh === null ? '#cbd5e1' : SPEED_COLOURS.find((c) => kmh < c.upTo).colour)

// Fits lat/lon into the box without distorting the shape (longitude shrinks by cos(latitude))
const projector = (bounds, width) => {
  const lonScale = Math.cos((((bounds.north + bounds.south) / 2) * Math.PI) / 180)
  const spanX = Math.max((bounds.east - bounds.west) * lonScale, 1e-9)
  const spanY = Math.max(bounds.north - bounds.south, 1e-9)
  const scale = Math.min((width - 2 * PAD) / spanX, (HEIGHT - 2 * PAD) / spanY)
  const offX = (width - spanX * scale) / 2
  const offY = (HEIGHT - spanY * scale) / 2
  return (lat, lon) => [offX + (lon - bounds.west) * lonScale * scale, offY + (bounds.north - lat) * scale]
}

// The route drawn to scale (no map tiles), each stretch coloured by speed, with start, end and the places you stopped
const RouteSvg = ({ route }) => {
  const [ref, width] = useElementWidth()
  if (!route || route.points.length < 2) return <div className="ts-chart-empty">No GPS route recorded</div>
  const project = width > 0 ? projector(route.bounds, width) : null
  const pts = project ? route.points.map(([lat, lon, kmh]) => [...project(lat, lon), kmh]) : []

  return (
    <div ref={ref} className="ts-chart">
      {project && (
        <svg width={width} height={HEIGHT} role="img" aria-label="Route coloured by speed">
          {pts.slice(1).map(([x, y, kmh], i) => (
            <line key={i} x1={pts[i][0]} y1={pts[i][1]} x2={x} y2={y} stroke={colourOf(kmh)} strokeWidth="3" strokeLinecap="round" />
          ))}
          {route.stops.map((s) => {
            const [x, y] = project(s.lat, s.lon)
            return <circle key={s.start} cx={x} cy={y} r={s.type === 'long' ? 7 : 5} fill="#fff" stroke="#1a1a2e" strokeWidth="2" />
          })}
          <circle cx={pts[0][0]} cy={pts[0][1]} r="7" fill="#16a34a" stroke="#fff" strokeWidth="2" />
          <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="7" fill="#dc2626" stroke="#fff" strokeWidth="2" />
        </svg>
      )}
      <div className="ts-legend">
        {SPEED_COLOURS.map((c) => <span key={c.label}><i style={{ background: c.colour }} />{c.label} km/h</span>)}
        <span><i className="ts-dot start" />start</span>
        <span><i className="ts-dot end" />end</span>
        <span><i className="ts-dot stop" />stops</span>
      </div>
    </div>
  )
}

export default RouteSvg
