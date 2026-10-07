import { Lightbulb } from 'lucide-react'
import { Card, Stat, StatGrid } from './Card'
import { fmtDuration, fmtNum, hourLabel } from './format'

const DayPlan = ({ plan }) => (
  <div className="ts-plan-option">
    <h4>{plan.capH} h of driving a day · {plan.days.length} {plan.days.length === 1 ? 'day' : 'days'}</h4>
    <ul className="ts-plan-days">
      {plan.days.map((d) => (
        <li key={d.day}>
          <span>Day {d.day}</span>
          <span>km {fmtNum(d.fromKm)}–{fmtNum(d.toKm)}</span>
          <span>{fmtNum(d.km)} km · {fmtDuration(d.drivingMs)}</span>
        </li>
      ))}
    </ul>
  </div>
)

const Breaks = ({ breaks }) => (
  <StatGrid>
    <Stat label="Breaks taken" value={breaks.taken} sub="30 min or more" />
    <Stat label="Average break" value={fmtDuration(breaks.avgMs)} />
    <Stat label="Typical stretch" value={fmtDuration(breaks.medianStretchMs)} sub="driving between breaks" />
    <Stat label="Longest stretch" value={fmtDuration(breaks.longestStretchMs)} sub={`suggest a break every ${fmtDuration(breaks.suggestedEveryMs)}`} />
  </StatGrid>
)

const FuelPlan = ({ fuel }) => (
  <StatGrid>
    <Stat label="Economy to budget" value={fmtNum(fuel.kmPerL, 1)} unit="km/L" />
    <Stat label="Fuel for the trip" value={fmtNum(fuel.fuelNeededL)} unit="L" />
    <Stat label="Range on a tank" value={fmtNum(fuel.fullRangeKm)} unit="km" sub={fuel.estTankL ? `about ${fuel.estTankL} L tank` : null} />
    <Stat label="Fill up every" value={fmtNum(fuel.plannedFillEveryKm)} unit="km" sub="with a fifth of the tank in hand" />
    <Stat label="Fill-ups needed" value={fuel.fillUpsNeeded === null ? '—' : fuel.fillUpsNeeded} sub={`you made ${fuel.fillUpsTaken}`} />
  </StatGrid>
)

const SlowSections = ({ sections }) => (
  <ul className="ts-stops">
    {sections.map((s) => (
      <li key={s.idx} className="ts-stop">
        <span className="ts-stop-km">km {fmtNum(s.fromKm)}–{fmtNum(s.toKm)}</span>
        <span className="ts-stop-what">averaged {fmtNum(s.avgKmh)} km/h</span>
      </li>
    ))}
  </ul>
)

const PaceByHour = ({ hours }) => (
  <div className="ts-pace">
    <div><b>Quickest hours</b>{hours.fastest.map((h) => <span key={h.hour} className="ts-chip good">{hourLabel(h.hour)} · {h.avgKmh} km/h</span>)}</div>
    <div><b>Slowest hours</b>{hours.slowest.map((h) => <span key={h.hour} className="ts-chip slow">{hourLabel(h.hour)} · {h.avgKmh} km/h</span>)}</div>
  </div>
)

const Stops = ({ stops }) => (
  <ul className="ts-stops">
    {stops.map((s) => (
      <li key={`${s.km}-${s.ms}`} className="ts-stop">
        <span className="ts-stop-km">km {fmtNum(s.km, 0)}</span>
        <span className="ts-stop-what">{s.kind === 'long' ? 'Long rest' : s.kind === 'short' ? 'Break' : 'Short pause'} · {fmtDuration(s.ms)}</span>
        <span className="ts-stop-when">around {hourLabel(s.hour)}</span>
      </li>
    ))}
  </ul>
)

// "Help plan the same trip": what this drive says about how to drive it again
const PlanTab = ({ analytics }) => {
  const { plan } = analytics
  return (
    <>
      <Card title="The trip as driven">
        <StatGrid>
          <Stat label="Distance" value={fmtNum(plan.basis.distanceKm, 0)} unit="km" />
          <Stat label="At the wheel" value={fmtDuration(plan.basis.drivingMs)} />
          <Stat label="Average pace" value={fmtNum(plan.basis.avgKmh)} unit="km/h" sub="including slow stretches" />
          <Stat label="Days driven" value={plan.basis.daysDriven} />
        </StatGrid>
      </Card>
      {plan.tips.length > 0 && (
        <Card title="What to take from it">
          <ul className="ts-tips">{plan.tips.map((t) => <li key={t.id}><Lightbulb size={15} />{t.text}</li>)}</ul>
        </Card>
      )}
      <Card title="Split it into days" hint="Same distance, with a cap on how long you drive each day.">
        {plan.dayPlans.map((p) => <DayPlan key={p.capH} plan={p} />)}
      </Card>
      <Card title="Breaks"><Breaks breaks={plan.breaks} /></Card>
      <Card title="Fuel"><FuelPlan fuel={plan.fuel} /></Card>
      {plan.slowSections.length > 0 && <Card title="Slowest sections" hint="Where the route cost you time. Budget extra here."><SlowSections sections={plan.slowSections} /></Card>}
      {(plan.hours.fastest.length > 0) && <Card title="Pace by hour of day"><PaceByHour hours={plan.hours} /></Card>}
      {plan.stops.length > 0 && <Card title="Where you stopped"><Stops stops={plan.stops} /></Card>}
    </>
  )
}

export default PlanTab
