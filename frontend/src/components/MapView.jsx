import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from 'react-leaflet'
import { useRoutedPath } from '../hooks/useRoutedPath'
import 'leaflet/dist/leaflet.css'

function MapController({ points, mode }) {
  const map = useMap()

  useEffect(() => {
    if (points.length === 0) return
    if (mode === 'route') {
      // Always fit all points — latest pin is always in view, zoom adapts
      map.fitBounds(points, { padding: [32, 32] })
    } else {
      // Track: pan to latest pin only, never touch zoom
      map.panTo(points[points.length - 1])
    }
  }, [points, mode, map])

  return null
}

function Compass({ heading }) {
  const deg = isNaN(heading) ? 0 : heading
  return (
    <div className="map-compass">
      <svg viewBox="0 0 80 80" width="72" height="72">
        <circle cx="40" cy="40" r="38" fill="rgba(255,255,255,0.92)" stroke="rgba(0,0,0,0.18)" strokeWidth="1.5" />
        {/* Cardinal ticks */}
        <line x1="40" y1="3"  x2="40" y2="10" stroke="#333" strokeWidth="2" />
        <line x1="40" y1="70" x2="40" y2="77" stroke="#bbb" strokeWidth="1" />
        <line x1="3"  y1="40" x2="10" y2="40" stroke="#bbb" strokeWidth="1" />
        <line x1="70" y1="40" x2="77" y2="40" stroke="#bbb" strokeWidth="1" />
        {/* Labels */}
        <text x="40" y="22" textAnchor="middle" dominantBaseline="middle" fontSize="9" fontWeight="700" fill="#333">N</text>
        <text x="40" y="60" textAnchor="middle" dominantBaseline="middle" fontSize="8" fill="#999">S</text>
        <text x="60" y="40" textAnchor="middle" dominantBaseline="middle" fontSize="8" fill="#999">E</text>
        <text x="20" y="40" textAnchor="middle" dominantBaseline="middle" fontSize="8" fill="#999">W</text>
        {/* Needle */}
        <g transform={`rotate(${deg}, 40, 40)`}>
          <polygon points="40,16 45,40 35,40" fill="#e74c3c" />
          <polygon points="40,64 45,40 35,40" fill="#bbb" />
        </g>
        <circle cx="40" cy="40" r="3.5" fill="#333" />
      </svg>
      <span className="compass-deg">{Math.round(deg)}°</span>
    </div>
  )
}

export default function MapView({ points, heading = 0 }) {
  const defaultCenter = [20, 0]
  const hasPoints = points.length > 0
  const { routed, loading } = useRoutedPath(points)
  const path = routed.length > 0 ? routed : points
  const [mode, setMode] = useState('route')

  return (
    <div className="map-wrapper">
      <MapContainer
        center={hasPoints ? points[0] : defaultCenter}
        zoom={13}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {hasPoints && (
          <>
            <MapController points={points} mode={mode} />
            <Polyline positions={path} color="#7c3aed" weight={4} opacity={loading ? 0.4 : 0.9} />
            {points.map((pos, i) => (
              <CircleMarker
                key={i}
                center={pos}
                radius={i === points.length - 1 ? 7 : 4}
                color={i === points.length - 1 ? '#e74c3c' : '#3498db'}
                fillColor={i === points.length - 1 ? '#e74c3c' : '#3498db'}
                fillOpacity={0.9}
              />
            ))}
          </>
        )}
      </MapContainer>
      <Compass heading={heading} />
      {hasPoints && (
        <div className="map-mode-toggle">
          <button className={`map-mode-btn${mode === 'route' ? ' active' : ''}`} onClick={() => setMode('route')}>
            Full Route
          </button>
          <button className={`map-mode-btn${mode === 'track' ? ' active' : ''}`} onClick={() => setMode('track')}>
            Track
          </button>
        </div>
      )}
    </div>
  )
}
