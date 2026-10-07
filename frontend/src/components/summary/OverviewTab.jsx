import {
  Route, Clock, Gauge, Milestone, Coffee, Fuel, Leaf, Mountain, Sparkles, Navigation, Moon, Hourglass,
  Compass, Thermometer, BatteryCharging, Droplet, Zap, MoveRight,
} from 'lucide-react'
import { Card } from './Card'
import { fmtDay, fmtDuration, fmtNum, fmtWhen } from './format'

const ICONS = {
  distance: Route, 'driving-time': Clock, 'top-speed': Gauge, 'longest-stretch': Milestone, 'longest-break': Coffee,
  fuel: Fuel, expressway: MoveRight, co2: Leaf, climb: Mountain, smoothness: Sparkles, highway: Navigation, night: Moon, 'stop-and-go': Hourglass,
  'straight-line': Compass, 'engine-heat': Thermometer, battery: BatteryCharging, fillups: Droplet, 'best-speed': Zap,
}
const TONE_COLOUR = { smooth: '#16a34a', mixed: '#d97706', rough: '#dc2626' }

// The big numbers: distance first, then the quick facts it comes with
const Hero = ({ summary }) => {
  const days = summary.days.length
  return (
    <div className="ts-hero">
      <span className="ts-hero-kicker">{fmtDay(summary.startAt)}{days > 1 ? ` – ${fmtDay(summary.endAt)}` : ''} · {days} {days === 1 ? 'day' : 'days'}</span>
      <span className="ts-hero-number">{fmtNum(summary.distanceKm, 1)}<small> km</small></span>
      <span className="ts-hero-sub">{fmtDuration(summary.drivingMs)} at the wheel · {fmtDuration(summary.spanMs)} start to finish</span>
      <div className="ts-hero-stats">
        <span><b>{fmtNum(summary.avgMovingKmh)}</b> km/h avg moving</span>
        <span><b>{fmtNum(summary.maxKmh)}</b> km/h top</span>
        <span><b>{summary.fuel.kmPerL ? fmtNum(summary.fuel.kmPerL, 1) : '—'}</b> km/L</span>
        <span><b>{summary.driving.score ?? '—'}</b>/100 smoothness</span>
      </div>
    </div>
  )
}

const Highlight = ({ h }) => {
  const Icon = ICONS[h.id] || Sparkles
  return (
    <div className="ts-highlight">
      <span className="ts-highlight-icon"><Icon size={18} /></span>
      <span className="ts-highlight-label">{h.label}</span>
      <span className="ts-highlight-value" style={h.tone ? { color: TONE_COLOUR[h.tone] } : undefined}>
        {typeof h.value === 'number' ? fmtNum(h.value, Number.isInteger(h.value) ? 0 : 1) : h.value}<small> {h.unit}</small>
      </span>
      {h.detail && <span className="ts-highlight-detail">{h.detail}</span>}
      {h.t && <span className="ts-highlight-when">{fmtWhen(h.t)}</span>}
    </div>
  )
}

// One row per driving day, bars scaled to the longest day
const DayStrip = ({ days }) => {
  const maxKm = Math.max(...days.map((d) => d.km), 1)
  return (
    <div className="ts-days">
      {days.map((d) => (
        <div key={d.index} className="ts-day">
          <span className="ts-day-name">Day {d.index}<small>{fmtDay(d.start)}</small></span>
          <span className="ts-day-bar"><i style={{ width: `${(d.km / maxKm) * 100}%` }} /></span>
          <span className="ts-day-km">{fmtNum(d.km, 0)} km</span>
          <span className="ts-day-meta">{fmtDuration(d.drivingMs)} · avg {fmtNum(d.avgKmh)} · top {fmtNum(d.maxKmh)} km/h</span>
        </div>
      ))}
    </div>
  )
}

const OverviewTab = ({ analytics }) => (
  <>
    <Hero summary={analytics.summary} />
    <div className="ts-highlights">{analytics.highlights.filter((h) => h.id !== 'distance').map((h) => <Highlight key={h.id} h={h} />)}</div>
    {analytics.summary.days.length > 1 && <Card title="Day by day"><DayStrip days={analytics.summary.days} /></Card>}
  </>
)

export default OverviewTab
