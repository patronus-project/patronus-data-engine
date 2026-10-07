import { CHUNK, EXT_PAGE, framesWanted, lookaheadFrames, planRequests, takeContiguous, extCovers } from './replayBuffer.js'

const RETRY_MS = 1500
const EXT_GIVE_UP_AFTER = 3   // ext GPS failing this many times in a row stops gating playback (the map just has fewer dots)

// Loads a replay's OBD records and ext GPS in the background, keeping a rolling lookahead ahead of the playhead.
// No React, no global fetch: everything it needs is passed in, so it can be tested with fake pages.
//
//   fetchJson(url) → Promise<json>          onTotal(n)          onRecords(chunk)   (chunks always continue the list)
//   onExt(state, docs)  state = { done, coveredMs }, docs = newly loaded ext GPS docs
//
// OBD records come in CHUNK-sized pages, up to MAX_PARALLEL at once, released in order. Ext GPS pages are asked for, one
// at a time, until they cover the time of the record at the end of the lookahead. Both loops top themselves up after every
// response and whenever the playhead or speed changes, instead of waiting for a buffer to run out.
export const createReplayLoader = ({ fetchJson, onTotal, onRecords, onExt, setTimer = setTimeout }) => {
  let generation = 0
  let source = null
  let requested = 0
  let inFlight = 0
  let loaded = 0
  let total = null
  let pages = new Map()
  let retry = []
  let records = []
  let frame = 0
  let speed = 1
  let ext = { done: false, coveredMs: 0 }
  let extNext = 0
  let extBusy = false
  let extFails = 0

  const url = (path, params) => `${path}?${new URLSearchParams({ start: source.start, end: source.end, ...params })}`

  // ── OBD records ──
  const pumpObd = () => {
    if (!source) return
    const due = retry.splice(0)
    const plan = planRequests({ requested, inFlight, total, wanted: framesWanted(frame, speed, total), retry: due })
    due.filter((offset) => !plan.offsets.includes(offset)).forEach((offset) => retry.push(offset))
    requested = plan.nextRequested
    plan.offsets.forEach(requestObd)
  }

  const requestObd = (offset) => {
    const gen = generation
    let ok = false
    inFlight += 1
    fetchJson(url('/api/obd2/history/paged', { offset, limit: CHUNK }))
      .then((data) => {
        if (gen !== generation) return
        ok = true
        if (total === null) {
          total = data.total
          onTotal(total)
        }
        pages.set(offset, data.records)
        const taken = takeContiguous(pages, loaded)
        if (taken.records.length > 0) {
          loaded = taken.length
          records.push(...taken.records)
          onRecords(taken.records)
        }
      })
      .catch(() => {
        if (gen !== generation) return
        setTimer(() => {
          if (gen !== generation) return
          retry.push(offset)
          pumpObd()
        }, RETRY_MS)
      })
      .finally(() => {
        if (gen !== generation) return
        inFlight -= 1
        if (ok) {
          pumpObd()
          pumpExt()
        }
      })
  }

  // ── ext GPS ──
  const pumpExt = () => {
    if (!source || extBusy || ext.done || records.length === 0) return
    const aheadIndex = Math.min(records.length - 1, frame + lookaheadFrames(speed))
    if (ext.coveredMs >= Date.parse(records[Math.max(0, aheadIndex)].receivedAt)) return
    requestExt()
  }

  const requestExt = () => {
    const gen = generation
    const offset = extNext
    let ok = false
    extBusy = true
    fetchJson(url('/api/obd2/ext-history/paged', { offset, limit: EXT_PAGE }))
      .then((data) => {
        if (gen !== generation) return
        ok = true
        extFails = 0
        const docs = data.records || []
        extNext = offset + docs.length
        const last = docs.length > 0 ? Date.parse(docs[docs.length - 1].obdReceivedAt) : ext.coveredMs
        ext = { done: docs.length === 0 || extNext >= data.total, coveredMs: Math.max(ext.coveredMs, last) }
        onExt(ext, docs)
      })
      .catch(() => {
        if (gen !== generation) return
        extFails += 1
        if (extFails >= EXT_GIVE_UP_AFTER) {
          ext = { ...ext, done: true }
          onExt(ext, [])
        } else {
          setTimer(() => { if (gen === generation) pumpExt() }, RETRY_MS)
        }
      })
      .finally(() => {
        if (gen !== generation) return
        extBusy = false
        if (ok) pumpExt()
      })
  }

  return {
    // New source (or none): forget everything in flight, start again from the first page
    reset(next) {
      generation += 1
      source = next
      requested = 0
      inFlight = 0
      loaded = 0
      total = null
      pages = new Map()
      retry = []
      records = []
      frame = 0
      ext = { done: false, coveredMs: 0 }
      extNext = 0
      extBusy = false
      extFails = 0
      pumpObd()
    },
    // The playhead or speed changed: top the lookahead back up
    setPlayhead(nextFrame, nextSpeed) {
      frame = nextFrame
      speed = nextSpeed
      pumpObd()
      pumpExt()
    },
    recordAt: (index) => records[index],
    total: () => total,
    loadedCount: () => records.length,
    ext: () => ext,
    // Is ext GPS loaded far enough for record `index`? (false if the record itself isn't loaded)
    extCoversRecord: (index) => !!records[index] && extCovers(ext, Date.parse(records[index].receivedAt)),
  }
}
