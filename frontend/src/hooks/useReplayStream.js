import { useState, useEffect, useCallback, useRef } from 'react'

const PAGE_SIZE = 100
const BASE_INTERVAL_MS = 600
const PREFETCH_THRESHOLD = 25 // fetch next page when ≤25 records remain in buffer

export function useReplayStream(source) {
  const [records, setRecords] = useState([])
  const [total, setTotal] = useState(0)
  const [frame, setFrame] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [buffering, setBuffering] = useState(false)

  const isFetching = useRef(false)
  const nextOffset = useRef(0)

  // sourceKey is a stable string — only changes when the actual time range changes
  const sourceKey = source ? `${source.start}|${source.end}` : ''

  const fetchPage = useCallback((src, offset) => {
    if (isFetching.current) return
    isFetching.current = true
    setBuffering(true)
    const params = new URLSearchParams({
      start: src.start,
      end: src.end,
      offset,
      limit: PAGE_SIZE,
    })
    fetch(`/api/obd2/history/paged?${params}`)
      .then(r => r.json())
      .then(data => {
        setTotal(data.total)
        setRecords(prev => offset === 0 ? data.records : [...prev, ...data.records])
        nextOffset.current = offset + data.records.length
      })
      .catch(() => {}) // caller sees buffering drop to false
      .finally(() => {
        isFetching.current = false
        setBuffering(false)
      })
  }, [])

  // Reset + load first page when source changes
  useEffect(() => {
    setRecords([])
    setTotal(0)
    setFrame(0)
    setPlaying(false)
    nextOffset.current = 0
    isFetching.current = false
    if (source) fetchPage(source, 0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey])

  // Pre-fetch next page when approaching the end of the current buffer
  useEffect(() => {
    if (!source || isFetching.current) return
    if (total > 0 && nextOffset.current >= total) return
    if (records.length > 0 && records.length - frame <= PREFETCH_THRESHOLD) {
      fetchPage(source, nextOffset.current)
    }
  }, [frame, records.length, total, source, fetchPage])

  // Play timer — advances frame; stalls if buffer hasn't arrived yet
  useEffect(() => {
    if (!playing || records.length === 0) return
    const id = setInterval(() => {
      setFrame(f => {
        const next = f + 1
        // Stall if we've consumed the buffer but more is coming
        if (next >= records.length) return f
        return next
      })
    }, BASE_INTERVAL_MS / speed)
    return () => clearInterval(id)
  }, [playing, speed, records.length])

  // Auto-stop when fully played through all fetched records
  useEffect(() => {
    if (playing && total > 0 && frame >= records.length - 1 && nextOffset.current >= total) {
      setPlaying(false)
    }
  }, [frame, playing, records.length, total])

  const play = useCallback(() => {
    if (records.length === 0) return
    setPlaying(true)
  }, [records.length])

  const pause = useCallback(() => setPlaying(false), [])

  const seek = useCallback((i) => {
    setFrame(Math.max(0, Math.min(i, records.length - 1)))
  }, [records.length])

  return {
    records,
    total,
    frame,
    playing,
    speed,
    buffering,
    currentRecord: records[frame] ?? null,
    play,
    pause,
    seek,
    setSpeed,
  }
}
