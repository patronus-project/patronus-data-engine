import { useEffect } from 'react'
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

function FitBounds({ points }) {
  const map = useMap()
  useEffect(() => {
    if (points.length > 0) {
      map.fitBounds(points, { padding: [32, 32] })
    }
  }, [points, map])
  return null
}

export default function MapView({ points }) {
  const defaultCenter = [20, 0]
  const hasPoints = points.length > 0

  return (
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
          <FitBounds points={points} />
          <Polyline positions={points} color="#e74c3c" weight={2} opacity={0.8} />
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
  )
}
