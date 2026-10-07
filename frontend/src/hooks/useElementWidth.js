import { useEffect, useRef, useState } from 'react'

// The rendered width of an element, kept current as it resizes (for SVG charts that fill their container)
export const useElementWidth = () => {
  const ref = useRef(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return [ref, width]
}
