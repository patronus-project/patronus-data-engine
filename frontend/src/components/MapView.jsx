import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from 'react-leaflet'
import { useRoutedPath } from '../hooks/useRoutedPath'
import 'leaflet/dist/leaflet.css'

// Track mode opens at a regional zoom (about 25 km across) rather than street level;
// after that the person's own zoom is left alone.
const TRACK_ZOOM = 12
const NO_POINTS = []

// Index of the newest entry that has a fix (trackPoints can hold nulls), or -1
const lastFix = (trackPoints) => {
  for (let i = trackPoints.length - 1; i >= 0; i--) if (trackPoints[i]) return i
  return -1
}

function MapController({ points, trackPoints, mode }) {
  const map = useMap()
  const trackStarted = useRef(false)

  // Every switch into Track re-centres once at TRACK_ZOOM
  useEffect(() => { trackStarted.current = false }, [mode])

  useEffect(() => {
    if (mode !== 'route' || points.length === 0) return
    // Full Route: always fit all points — latest pin is always in view, zoom adapts
    map.fitBounds(points, { padding: [32, 32] })
  }, [points, mode, map])

  useEffect(() => {
    if (mode !== 'track') return
    const i = lastFix(trackPoints)
    if (i < 0) {
      trackStarted.current = false
      return
    }
    if (!trackStarted.current) {
      map.setView(trackPoints[i], TRACK_ZOOM, { animate: false })
      trackStarted.current = true
    } else {
      // Follow the newest point without touching the zoom
      map.panTo(trackPoints[i], { animate: true, duration: 0.3 })
    }
  }, [trackPoints, mode, map])

  return null
}

// Track mode: the rolling window of recent points as dots, the newest in red. Dots are keyed by their position in the
// record list (trackOffset + i), so as the window slides only the ends change. The line joining them is only drawn
// when showLine is true (replay paused) — while points are streaming in it is just noise.
const TrackLayer = ({ trackPoints, trackOffset, showLine }) => {
  const last = lastFix(trackPoints)
  if (last < 0) return null
  return (
    <>
      {showLine && <Polyline positions={trackPoints.filter(Boolean)} color="#7c3aed" weight={4} opacity={0.9} />}
      {trackPoints.map((pos, i) => pos && i !== last && (
        <CircleMarker key={trackOffset + i} center={pos} radius={3} color="#3498db" fillColor="#3498db" fillOpacity={0.9} weight={1} />
      ))}
      <CircleMarker key="current" center={trackPoints[last]} radius={7} color="#e74c3c" fillColor="#e74c3c" fillOpacity={0.9} />
    </>
  )
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

// points: the thinned whole-route path (Full Route mode).
// trackPoints: full-resolution recent trail, one entry per record ([lat, lng] or null), trackOffset = index of the first
// record it covers (Track mode, the default). showTrackLine: also join the track dots with a line (replay paused).
export default function MapView({ points, trackPoints = NO_POINTS, trackOffset = 0, showTrackLine = false, heading = 0 }) {
  const defaultCenter = [20, 0]
  const [mode, setMode] = useState('track')
  const trackLast = lastFix(trackPoints)
  const hasPoints = points.length > 0 || trackLast >= 0
  // Road-snapping (OSRM) is only needed for Full Route, so Track mode doesn't spend requests on it
  const { routed, loading } = useRoutedPath(mode === 'route' ? points : NO_POINTS)
  const path = routed.length > 0 ? routed : points
  const start = trackLast >= 0 ? trackPoints[trackLast] : points.length > 0 ? points[0] : defaultCenter

  return (
    <div className="map-wrapper">
      <MapContainer
        center={start}
        zoom={TRACK_ZOOM}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {hasPoints && <MapController points={points} trackPoints={trackPoints} mode={mode} />}
        {mode === 'track' && <TrackLayer trackPoints={trackPoints} trackOffset={trackOffset} showLine={showTrackLine} />}
        {mode === 'route' && points.length > 0 && (
          <>
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
