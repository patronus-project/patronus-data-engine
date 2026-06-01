import { useState, useEffect, useCallback } from 'react'

const BASE_INTERVAL_MS = 600

export function useReplay(records) {
  const [frame, setFrame] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)

  const total = records.length

  // Drive the frame counter forward
  useEffect(() => {
    if (!playing || total === 0) return
    const id = setInterval(() => {
      setFrame(f => Math.min(f + 1, total - 1))
    }, BASE_INTERVAL_MS / speed)
    return () => clearInterval(id)
  }, [playing, speed, total])

  // Auto-stop when we reach the last frame
  useEffect(() => {
    if (playing && frame >= total - 1) setPlaying(false)
  }, [frame, playing, total])

  // Reset when a new trip is selected
  useEffect(() => {
    setPlaying(false)
    setFrame(0)
  }, [records])

  const play = useCallback(() => {
    if (total === 0) return
    if (frame >= total - 1) setFrame(0)
    setPlaying(true)
  }, [frame, total])

  const pause = useCallback(() => setPlaying(false), [])

  const seek = useCallback((index) => {
    setFrame(Math.max(0, Math.min(index, total - 1)))
  }, [total])

  return {
    frame,
    total,
    playing,
    speed,
    currentRecord: records[frame] ?? null,
    play,
    pause,
    seek,
    setSpeed,
  }
}
