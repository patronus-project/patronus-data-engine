import { useState, useEffect, useCallback, useRef } from 'react'

const PAGE_SIZE = 100
const BASE_INTERVAL_MS = 600
const PREFETCH_THRESHOLD = 25 // fetch next page when ≤25 records remain in buffer
const SEEK_DEBOUNCE_MS = 200 // debounce seek-triggered prefetch

export function useReplayStream(source) {
  const [records, setRecords] = useState([])
  const [total, setTotal] = useState(0)
  const [frame, setFrame] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [buffering, setBuffering] = useState(false)

  const isFetching = useRef(false)
  const nextOffset = useRef(0)
  const seekDebounceId = useRef(null)

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
      .catch(() => {})
      .finally(() => {
        isFetching.current = false
        setBuffering(false)
      })
  }, [])

  // Prefetch pages needed for seek target (debounced)
  const prefetchForSeek = useCallback((targetFrame) => {
    if (!source || isFetching.current || total === 0) return
    
    // Calculate which page(s) are needed
    const targetPageStart = Math.floor(targetFrame / PAGE_SIZE) * PAGE_SIZE
    
    // If target page is already loaded, do nothing
    if (targetPageStart < records.length) return
    
    // Otherwise, fetch the page containing targetFrame
    const offset = targetPageStart
    if (offset < total) {
      fetchPage(source, offset)
    }
  }, [source, records.length, total, fetchPage])

  // Debounced seek prefetch
  const schedulePrefetchForSeek = useCallback((targetFrame) => {
    if (seekDebounceId.current !== null) {
      clearTimeout(seekDebounceId.current)
    }
    seekDebounceId.current = setTimeout(() => {
      prefetchForSeek(targetFrame)
      seekDebounceId.current = null
    }, SEEK_DEBOUNCE_MS)
  }, [prefetchForSeek])

  // Reset + load first page when source changes
  useEffect(() => {
    setRecords([])
    setTotal(0)
    setFrame(0)
    setPlaying(false)
    nextOffset.current = 0
    isFetching.current = false
    if (seekDebounceId.current !== null) {
      clearTimeout(seekDebounceId.current)
      seekDebounceId.current = null
    }
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

  // Play timer — advances frame; frame can exceed buffer during playback
  useEffect(() => {
    if (!playing || records.length === 0) return
    const id = setInterval(() => {
      setFrame(f => {
        const next = f + 1
        // Trigger prefetch if approaching end of buffer
        if (next >= records.length - PREFETCH_THRESHOLD && !isFetching.current && nextOffset.current < total) {
          // Prefetch will happen in the other useEffect
        }
        // Allow frame to go beyond records temporarily; will stall visually if buffer hasn't arrived
        if (next >= records.length) return f
        return next
      })
    }, BASE_INTERVAL_MS / speed)
    return () => clearInterval(id)
  }, [playing, speed, records.length, total])

  // Auto-stop when fully played through all fetched records
  useEffect(() => {
    if (playing && total > 0 && frame >= records.length - 1 && nextOffset.current >= total) {
      setPlaying(false)
    }
  }, [frame, playing, records.length, total])

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (seekDebounceId.current !== null) {
        clearTimeout(seekDebounceId.current)
      }
    }
  }, [])

  const play = useCallback(() => {
    if (records.length === 0) return
    setPlaying(true)
  }, [records.length])

  const pause = useCallback(() => setPlaying(false), [])

  const seek = useCallback((i) => {
    // Allow seeking up to total - 1, not just records.length - 1
    const maxFrame = total > 0 ? total - 1 : records.length - 1
    const targetFrame = Math.max(0, Math.min(i, maxFrame))
    setFrame(targetFrame)
    
    // If seek is beyond current buffer, trigger prefetch for that page
    if (targetFrame >= records.length) {
      schedulePrefetchForSeek(targetFrame)
    }
  }, [records.length, total, schedulePrefetchForSeek])

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
