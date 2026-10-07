import { Card } from './Card'
import { Columns, HBars } from './Bars'
import LineChartSvg from './LineChartSvg'
import { clockAt, fmtDuration, fmtNum, fmtWhen, hourLabel, tripXAt } from './format'

// Every line chart shares one x axis: trip time (driving clock, overnight stops removed), so a multi-day trip is one
// continuous line. Pointing at it shows the wall-clock time too.
const axisFor = (charts) => {
  const xLabel = (x) => fmtDuration(x)
  const readout = (unit, digits = 0) => (x, y) => `${fmtWhen(clockAt(charts.segments, x))} · trip ${fmtDuration(x)} · ${fmtNum(y, digits)} ${unit}`
  return { xLabel, readout, marks: charts.dayMarks }
}

const SpeedBandBars = ({ bands }) => {
  const total = bands.reduce((s, b) => s + b.ms, 0) || 1
  return (
    <HBars color="#3b82f6" items={bands.filter((b) => b.ms > 0).map((b) => ({
      label: b.to >= 999 ? `${b.from}+ km/h` : `${b.from}–${b.to} km/h`,
      value: b.ms,
      display: `${Math.round((b.ms / total) * 100)}%`,
      sub: ` ${fmtDuration(b.ms)} · ${fmtNum(b.km, 0)} km`,
    }))} />
  )
}

const ChartsTab = ({ analytics }) => {
  const { charts, engine, summary } = analytics
  const { xLabel, readout, marks } = axisFor(charts)
  const refuelMarks = summary.fuel.refuels.map((r) => tripXAt(charts.segments, r.t)).filter((x) => x !== null)
  const coolantLines = [engine.coolant.amber && { y: engine.coolant.amber, color: '#d97706' }, engine.coolant.red && { y: engine.coolant.red, color: '#dc2626' }].filter(Boolean)

  return (
    <>
      <Card title="Speed" hint="Dashed lines mark the start of each day.">
        <LineChartSvg series={charts.speed} yFloor={0} xLabel={xLabel} yLabel={(y) => String(Math.round(y))} readout={readout('km/h')} marks={marks} color="#3b82f6" />
      </Card>
      <Card title="Distance covered">
        <LineChartSvg series={charts.distance} yFloor={0} xLabel={xLabel} readout={readout('km', 1)} marks={marks} color="#8b5cf6" yLabel={(y) => String(Math.round(y))} />
      </Card>
      <Card title="Elevation" hint="GPS altitude, smoothed.">
        <LineChartSvg series={charts.altitude} xLabel={xLabel} readout={readout('m')} marks={marks} color="#10b981" yLabel={(y) => String(Math.round(y))} />
      </Card>
      <Card title="Engine speed">
        <LineChartSvg series={charts.rpm} yFloor={0} xLabel={xLabel} readout={readout('rpm')} marks={marks} color="#f59e0b" yLabel={(y) => String(Math.round(y))} />
      </Card>
      <Card title="Coolant temperature" hint={engine.coolant.amber ? `Amber ${engine.coolant.amber} °C · red ${engine.coolant.red} °C` : undefined}>
        <LineChartSvg series={charts.coolant} xLabel={xLabel} readout={readout('°C')} marks={marks} hlines={coolantLines} color="#ef4444" yLabel={(y) => String(Math.round(y))} />
      </Card>
      <Card title="Fuel level" hint={refuelMarks.length ? 'Dashed lines are fill-ups.' : undefined}>
        <LineChartSvg series={charts.fuelLevel} yFloor={0} xLabel={xLabel} readout={readout('%', 1)} marks={refuelMarks} color="#0ea5e9" yLabel={(y) => String(Math.round(y))} />
      </Card>
      <Card title="Time at each speed"><SpeedBandBars bands={charts.speedBands} /></Card>
      <Card title="When you drove" hint="Moving time by hour of the day (your local time).">
        <Columns color="#6366f1" labelEvery={3} items={charts.hourOfDay.map((h) => ({ label: hourLabel(h.hour).slice(0, 2), value: h.ms, title: `${hourLabel(h.hour)} · ${fmtDuration(h.ms)}${h.avgKmh ? ` · avg ${h.avgKmh} km/h` : ''}` }))} />
      </Card>
    </>
  )
}

export default ChartsTab
