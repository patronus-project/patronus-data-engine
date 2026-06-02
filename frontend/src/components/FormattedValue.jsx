export default function FormattedValue({ value, unit }) {
  if (value === null || value === undefined || value === '') return <span>—</span>
  const num = parseFloat(value)
  const formatted = !isNaN(num) ? num.toFixed(3) : String(value)
  return <span>{formatted}{unit ? <span className="kpi-unit"> {unit}</span> : null}</span>
}
