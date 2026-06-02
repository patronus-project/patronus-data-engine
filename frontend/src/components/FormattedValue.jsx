import { parseUnit } from './utils'

export default function FormattedValue({ value, unit }) {
  if (value === null || value === undefined || value === '') return <span>—</span>
  const { value: parsed, unit: displayUnit } = parseUnit(unit, value)
  const num = parseFloat(parsed)
  const formatted = !isNaN(num) ? num.toFixed(3) : String(parsed)
  return <span>{formatted}{displayUnit ? <span className="kpi-unit"> {displayUnit}</span> : null}</span>
}
