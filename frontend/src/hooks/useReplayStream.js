import { useState, useEffect, useCallback, useRef } from 'react'
import { BASE_INTERVAL_MS, framesWanted, bufferReady, extCovers } from './replayBuffer'
import { createReplayLoader } from './replayLoader'

const readJson = (res) => {
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// Streams a replay's data and drives its playhead.
//
// The loading is done by replayLoader: OBD records and ext GPS, kept loaded about 20 s of playback ahead of the playhead at
// the selected speed (100 frames at 1-2×, 334 at 10×, 667 at 20×) and topped up continuously, not when a buffer runs out.
// Here: playback only advances when the next record AND ext GPS up to its time are loaded, so the map can never lag the
// numbers; and starting, seeking or changing speed while playing holds until a fresh lookahead is in, then carries on.
export function useReplayStream(source) {
  const [records, setRecords] = useState([])
  const [total, setTotal] = useState(0)
  const [frame, setFrame] = useState(0)
  const [wantPlay, setWantPlay] = useState(false)
  const [speed, setSpeedState] = useState(1)
  const [waitFor, setWaitFor] = useState(null)             // { frames }: the buffer playback must have before (re)starting
  const [extMap, setExtMap] = useState(() => new Map())    // sync_ts → joined ext GPS doc
  const [ext, setExt] = useState({ done: false, coveredMs: 0 })

  const [loader] = useState(() => createReplayLoader({
    fetchJson: (url) => fetch(url).then(readJson),
    onTotal: setTotal,
    onRecords: (chunk) => setRecords((prev) => prev.concat(chunk)),
    onExt: (state, docs) => {
      if (docs.length > 0) {
        setExtMap((prev) => {
          const next = new Map(prev)
          docs.forEach((doc) => next.set(doc.sync_ts, doc))
          return next
        })
      }
      setExt(state)
    },
  }))

  // The latest playhead, for callbacks and timers that must not go stale
  const frameRef = useRef(0)
  const speedRef = useRef(1)
  const wantPlayRef = useRef(false)

  // sourceKey is a stable string — only changes when the actual time range changes
  const sourceKey = source ? `${source.start}|${source.end}` : ''

  useEffect(() => {
    frameRef.current = frame
    speedRef.current = speed
    wantPlayRef.current = wantPlay
  }, [frame, speed, wantPlay])

  // Reset and start loading when the source changes (declared before the playhead effect, which then reads frame 0)
  useEffect(() => {
    frameRef.current = 0
    setRecords([])
    setTotal(0)
    setFrame(0)
    setWantPlay(false)
    setWaitFor(null)
    setExtMap(new Map())
    setExt({ done: false, coveredMs: 0 })
    loader.reset(source)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey, loader])

  // The rolling buffer: whenever the playhead or the speed changes, the loader tops its lookahead back up
  useEffect(() => {
    loader.setPlayhead(frameRef.current, speed)
  }, [frame, speed, loader])

  const ready = bufferReady({ waitFor, loaded: records.length, total, records, ext })
  const running = wantPlay && ready

  useEffect(() => {
    if (!running) return undefined
    const id = setInterval(() => {
      const next = frameRef.current + 1
      const end = loader.total()
      if (end !== null && next >= end) {
        setWantPlay(false)                                    // reached the end
        return
      }
      if (!loader.recordAt(next) || !loader.extCoversRecord(next)) return   // not here yet: hold this frame
      frameRef.current = next
      setFrame(next)
    }, BASE_INTERVAL_MS / speed)
    return () => clearInterval(id)
  }, [running, speed, loader])

  const play = useCallback(() => {
    if (loader.loadedCount() === 0) return
    let from = frameRef.current
    const end = loader.total()
    if (end !== null && from >= end - 1) {                    // at the end: Play restarts
      from = 0
      frameRef.current = 0
      setFrame(0)
    }
    setWaitFor({ frames: framesWanted(from, speedRef.current, end) })
    setWantPlay(true)
  }, [loader])

  const pause = useCallback(() => setWantPlay(false), [])

  const seek = useCallback((i) => {
    const end = loader.total()
    const last = end !== null ? end - 1 : loader.loadedCount() - 1
    const target = Math.max(0, Math.min(i, last))
    frameRef.current = target
    setFrame(target)
    // Playing: hold until the lookahead around the new position is loaded. Paused: the loader just fetches it.
    if (wantPlayRef.current) setWaitFor({ frames: framesWanted(target, speedRef.current, end) })
  }, [loader])

  // Changing speed while playing pauses until a lookahead for the NEW speed is in, then resumes by itself
  const setSpeed = useCallback((next) => {
    speedRef.current = next
    setSpeedState(next)
    if (wantPlayRef.current) setWaitFor({ frames: framesWanted(frameRef.current, next, loader.total()) })
  }, [loader])

  // "Buffering": the person is waiting on data (nothing loaded yet, the playhead is past what is loaded, a fresh buffer is
  // being built, or playback is holding for the next record / ext GPS)
  const nextRecord = records[frame + 1]
  const holding = wantPlay && ready && total > 0 && frame + 1 < total
    && !(nextRecord && extCovers(ext, new Date(nextRecord.receivedAt).getTime()))
  const buffering = !!source && (records.length === 0 || frame >= records.length || (wantPlay && !ready) || holding)

  return {
    records,
    total,
    frame,
    playing: wantPlay,
    speed,
    buffering,
    currentRecord: records[frame] ?? null,
    extMap,
    play,
    pause,
    seek,
    setSpeed,
  }
}
