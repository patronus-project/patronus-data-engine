import { Card } from './Card'
import RouteSvg from './RouteSvg'
import { fmtDay, fmtClock, fmtDuration, fmtNum, osmLink } from './format'

const StopRow = ({ stop }) => (
  <li className="ts-stop">
    <span className="ts-stop-km">km {fmtNum(stop.km, 0)}</span>
    <span className="ts-stop-what">{stop.type === 'long' ? 'Overnight / long rest' : stop.type === 'short' ? 'Break' : 'Short pause'} · {fmtDuration(stop.ms)}</span>
    <span className="ts-stop-when">{fmtDay(stop.start)}, {fmtClock(stop.start)}</span>
    <a className="ts-link" href={osmLink(stop.lat, stop.lon)} target="_blank" rel="noreferrer">map</a>
  </li>
)

const RouteTab = ({ analytics }) => (
  <>
    <Card title="Route" hint="Drawn to scale from the GPS fixes; each stretch is coloured by speed.">
      <RouteSvg route={analytics.route} />
    </Card>
    {analytics.route.stops.length > 0 && (
      <Card title={`Where you stopped (${analytics.route.stops.length})`} hint="Pauses of 15 minutes or more.">
        <ul className="ts-stops">{analytics.route.stops.map((s) => <StopRow key={s.start} stop={s} />)}</ul>
      </Card>
    )}
  </>
)

export default RouteTab
