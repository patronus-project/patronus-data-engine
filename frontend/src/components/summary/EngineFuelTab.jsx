import { Card, Stat, StatGrid } from './Card'
import { HBars } from './Bars'
import { fmtDuration, fmtNum, fmtWhen } from './format'

const range = (s, unit) => (s.avg === null ? '—' : `${fmtNum(s.min)}–${fmtNum(s.max)} ${unit}`)

const EngineStats = ({ engine }) => (
  <StatGrid>
    <Stat label="Coolant" value={fmtNum(engine.coolant.max)} unit="°C max" sub={`avg ${fmtNum(engine.coolant.avg)} °C`} />
    <Stat label="Above amber" value={fmtDuration(engine.coolant.msAboveAmber)} sub={engine.coolant.amber ? `over ${engine.coolant.amber} °C` : null} />
    <Stat label="Above red" value={fmtDuration(engine.coolant.msAboveRed)} sub={engine.coolant.red ? `over ${engine.coolant.red} °C` : null} />
    <Stat label="Oil" value={engine.oil.max === null ? '—' : fmtNum(engine.oil.max)} unit="°C max" />
    <Stat label="Engine load" value={fmtNum(engine.load.avg)} unit="% avg" sub={`peak ${fmtNum(engine.load.max)}%`} />
    <Stat label="Throttle" value={fmtNum(engine.throttle.avg)} unit="% avg" />
    <Stat label="RPM" value={fmtNum(engine.rpm.avg)} unit="avg" sub={`peak ${fmtNum(engine.rpm.max)} · ${fmtNum(engine.rpm.highPct, 1)}% over 3,500`} />
    <Stat label="Battery" value={fmtNum(engine.voltage.avg, 1)} unit="V avg" sub={`dips to ${fmtNum(engine.voltage.typicalLow, 1)} V · ${fmtNum(engine.voltage.lowPct, 0)}% of the time under 12.8`} />
    <Stat label="Intake air" value={range(engine.intake, '°C')} />
    <Stat label="Outside" value={range(engine.ambient, '°C')} />
    <Stat label="Warm-up" value={engine.warmup.coldStart ? (engine.warmup.minutes === null ? 'never' : `${fmtNum(engine.warmup.minutes, 0)} min`) : 'started warm'} />
  </StatGrid>
)

const RpmBands = ({ bands }) => {
  const total = bands.reduce((s, b) => s + b.ms, 0) || 1
  return (
    <HBars color="#f59e0b" items={bands.filter((b) => b.ms > 0).map((b) => ({
      label: b.to >= 9999 ? `${b.from}+ rpm` : `${b.from}–${b.to} rpm`,
      value: b.ms, display: `${Math.round((b.ms / total) * 100)}%`, sub: ` ${fmtDuration(b.ms)}`,
    }))} />
  )
}

const FuelFacts = ({ fuel }) => (
  <StatGrid>
    <Stat label="Fuel burnt" value={fmtNum(fuel.usedL, 1)} unit="L" sub={fuel.co2Kg ? `${fmtNum(fuel.co2Kg, 0)} kg CO₂` : null} />
    <Stat label="Economy" value={fmtNum(fuel.kmPerL, 1)} unit="km/L" sub={`${fmtNum(fuel.lPer100Km, 1)} L/100 km`} />
    <Stat label="Tank" value={fuel.tankStartPct === null ? '—' : `${fuel.tankStartPct}% → ${fuel.tankEndPct}%`} sub={fuel.estTankL ? `about ${fmtNum(fuel.estTankL)} L tank` : null} />
    <Stat label="Fill-ups" value={fuel.refuels.length} />
  </StatGrid>
)

const Efficiency = ({ bands }) => {
  const usable = bands.filter((b) => b.kmPerL !== null && b.km >= 2)
  return usable.length === 0 ? <p className="ts-card-hint">Not enough fuel-flow data per speed.</p> : (
    <HBars color="#10b981" items={usable.map((b) => ({
      label: b.to >= 999 ? `${b.from}+ km/h` : `${b.from}–${b.to} km/h`, value: b.kmPerL, display: `${fmtNum(b.kmPerL, 1)} km/L`, sub: ` ${fmtNum(b.km, 0)} km`,
    }))} />
  )
}

const Refuels = ({ refuels }) => (
  <ul className="ts-stops">
    {refuels.map((r) => (
      <li key={r.t} className="ts-stop">
        <span className="ts-stop-km">km {fmtNum(r.km, 0)}</span>
        <span className="ts-stop-what">{r.fromPct}% → {r.toPct}%{r.addedL ? ` · about ${fmtNum(r.addedL, 0)} L` : ''}</span>
        <span className="ts-stop-when">{fmtWhen(r.t)}</span>
      </li>
    ))}
  </ul>
)

const EngineFuelTab = ({ analytics }) => (
  <>
    <Card title="Fuel"><FuelFacts fuel={analytics.summary.fuel} /></Card>
    <Card title="Economy by speed" hint="Kilometres per litre while cruising in each speed band: where the car is happiest.">
      <Efficiency bands={analytics.charts.efficiencyBySpeed} />
    </Card>
    {analytics.summary.fuel.refuels.length > 0 && <Card title="Fill-ups"><Refuels refuels={analytics.summary.fuel.refuels} /></Card>}
    <Card title="Engine and electrics"><EngineStats engine={analytics.engine} /></Card>
    <Card title="Time at each engine speed"><RpmBands bands={analytics.engine.rpmBands} /></Card>
  </>
)

export default EngineFuelTab
