import { useState } from 'react'

// A single persisted override keeps the two force modes mutually exclusive.
const LS_KEY = 'patronus_gps_override'
const LEGACY_LS_KEY = 'patronus_obd_override'

export function useExtGpsToggle() {
  const [override, setOverride] = useState(() => {
    const saved = localStorage.getItem(LS_KEY) ?? localStorage.getItem(LEGACY_LS_KEY)
    if (saved === 'true' || saved === 'obd') return 'obd'
    if (saved === 'ext') return 'ext'
    return 'auto'
  })

  function toggle(target) {
    setOverride(prev => {
      const next = prev === target ? 'auto' : target
      localStorage.setItem(LS_KEY, next)
      return next
    })
  }

  return [
    override === 'obd',
    () => toggle('obd'),
    override === 'ext',
    () => toggle('ext'),
  ]
}
