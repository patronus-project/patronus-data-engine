import { useState } from 'react'

// forceObd = true  → ignore evaluator, always use OBD/Torque GPS
// forceObd = false → evaluator decides (default)
const LS_KEY = 'patronus_obd_override'

export function useExtGpsToggle() {
  const [forceObd, setForceObd] = useState(() => localStorage.getItem(LS_KEY) === 'true')

  function toggle() {
    setForceObd(prev => {
      const next = !prev
      localStorage.setItem(LS_KEY, String(next))
      return next
    })
  }

  return [forceObd, toggle]
}
