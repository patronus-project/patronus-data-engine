export default function FormattedValue({ value }) {
  if (value === null || value === undefined || value === '') return <span>—</span>
  const num = parseFloat(value)
  if (!isNaN(num)) return <span>{num.toFixed(3)}</span>
  return <span>{value}</span>
}
