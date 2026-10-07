import { Flag, CalendarDays, Coffee, Fuel, Gauge, OctagonAlert, Rocket, Milestone, Thermometer, Route, MoveRight } from 'lucide-react'
import { dayKey, fmtClock, fmtDay, fmtDuration, fmtNum, osmLink } from './format'

const ICONS = {
  start: Flag, end: Flag, 'day-start': CalendarDays, break: Coffee, refuel: Fuel, 'top-speed': Gauge,
  'hardest-brake': OctagonAlert, 'hardest-accel': Rocket, 'longest-stretch': Milestone, 'peak-coolant': Thermometer, milestone: Route, expressway: MoveRight,
}

// The words for each kind of event; the numbers come straight from the analytics
const TEXT = {
  start: () => ({ title: 'Trip started' }),
  end: (e) => ({ title: 'Trip ended', detail: e.km !== undefined ? `${fmtNum(e.km, 1)} km driven` : null }),
  'day-start': (e) => ({ title: `Day ${e.day} begins`, detail: `${fmtNum(e.km, 0)} km done so far` }),
  break: (e) => ({
    title: e.kind === 'long' ? `Long rest · ${fmtDuration(e.ms)}` : `Break · ${fmtDuration(e.ms)}`,
    detail: `at km ${fmtNum(e.km, 0)}, back on the road ${fmtClock(e.end)}`,
  }),
  refuel: (e) => ({ title: `Fill-up ${e.addedL ? `· about ${fmtNum(e.addedL, 0)} L` : ''}`, detail: `tank ${e.fromPct}% → ${e.toPct}% at km ${fmtNum(e.km, 0)}` }),
  'top-speed': (e) => ({ title: `Top speed · ${fmtNum(e.kmh)} km/h`, detail: `at km ${fmtNum(e.km, 0)}` }),
  'hardest-brake': (e) => ({ title: `Hardest braking · ${e.g} g`, detail: `${e.fromKmh} → ${e.toKmh} km/h at km ${fmtNum(e.km, 0)}` }),
  'hardest-accel': (e) => ({ title: `Hardest acceleration · ${e.g} g`, detail: `${e.fromKmh} → ${e.toKmh} km/h at km ${fmtNum(e.km, 0)}` }),
  'longest-stretch': (e) => ({ title: 'Longest non-stop stretch begins', detail: `${fmtNum(e.km, 0)} km without stopping, ${fmtDuration(e.ms)}` }),
  'peak-coolant': (e) => ({ title: `Engine hottest · ${e.c} °C`, detail: `at km ${fmtNum(e.km, 0)}` }),
  milestone: (e) => ({ title: `${fmtNum(e.km)} km` }),
  expressway: (e) => ({ title: `Expressway · ${fmtNum(e.km, 0)} km`, detail: `averaging ${e.avgKmh} km/h for ${fmtDuration(e.ms)}, from km ${fmtNum(e.atKm, 0)}` }),
}

const Event = ({ event }) => {
  const Icon = ICONS[event.type] || Flag
  const { title, detail } = (TEXT[event.type] || (() => ({ title: event.type })))(event)
  return (
    <li className={`ts-event ts-event-${event.type}`}>
      <span className="ts-event-icon"><Icon size={15} /></span>
      <span className="ts-event-time">{fmtClock(event.t)}</span>
      <span className="ts-event-body">
        <b>{title}</b>
        {detail && <small>{detail}</small>}
      </span>
      {event.lat !== null && event.lat !== undefined && <a className="ts-link" href={osmLink(event.lat, event.lon)} target="_blank" rel="noreferrer">map</a>}
    </li>
  )
}

// Events in time order, under a heading for each local day
const TimelineTab = ({ analytics }) => {
  const groups = []
  analytics.timeline.forEach((event) => {
    const key = dayKey(event.t)
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.events.push(event)
    else groups.push({ key, t: event.t, events: [event] })
  })
  return (
    <div className="ts-timeline">
      {groups.map((g) => (
        <section key={g.key}>
          <h3 className="ts-timeline-day">{fmtDay(g.t)}</h3>
          <ul className="ts-events">{g.events.map((e) => <Event key={`${e.t}-${e.type}`} event={e} />)}</ul>
        </section>
      ))}
    </div>
  )
}

export default TimelineTab
