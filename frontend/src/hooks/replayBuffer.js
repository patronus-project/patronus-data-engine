// Pure planning for the replay's rolling buffer: how far ahead of the playhead to keep data loaded, which pages to
// request next, and how arriving pages are folded into one contiguous list. No React, no fetch: unit-tested.

// One frame every BASE_INTERVAL_MS / speed
export const BASE_INTERVAL_MS = 600
// Keep this many seconds of playback loaded ahead of the playhead, at whatever speed is selected
export const LOOKAHEAD_SECONDS = 20
export const MIN_LOOKAHEAD_FRAMES = 100
export const CHUNK = 250          // records per OBD request
export const MAX_PARALLEL = 3     // OBD requests in flight at once
export const EXT_PAGE = 500       // ext GPS docs per request (the server's cap)

// Frames of playback in LOOKAHEAD_SECONDS at this speed: 1× ≈ 33, 5× ≈ 167, 10× ≈ 333, 20× ≈ 667 (never under 100)
export const lookaheadFrames = (speed) =>
  Math.max(MIN_LOOKAHEAD_FRAMES, Math.ceil((LOOKAHEAD_SECONDS * speed * 1000) / BASE_INTERVAL_MS))

// How many records (from the start) should be loaded for the playhead at `frame` to have a full lookahead.
// total is null until the first response says how many there are.
export const framesWanted = (frame, speed, total) => {
  const want = frame + 1 + lookaheadFrames(speed)
  return total === null ? want : Math.min(total, want)
}

// Offsets to request now. requested = offset of the next page never asked for; retry = offsets that failed and are due
// again. Never more than MAX_PARALLEL in flight, never past what is wanted, and before the total is known only the
// first page (it tells us the total).
export const planRequests = ({ requested, inFlight, total, wanted, retry = [] }) => {
  const offsets = [];
  let free = MAX_PARALLEL - inFlight;
  retry.forEach((offset) => { if (free > 0) { offsets.push(offset); free -= 1; } });
  if (total === null) {
    // Nothing asked yet: the first page, alone, so we learn the total before fanning out
    if (requested === 0 && inFlight === 0 && offsets.length === 0) return { offsets: [0], nextRequested: CHUNK };
    return { offsets, nextRequested: requested };
  }
  let next = requested;
  while (free > 0 && next < Math.min(total, wanted)) {
    offsets.push(next);
    next += CHUNK;
    free -= 1;
  }
  return { offsets, nextRequested: next };
}

// Pages arrive in any order; the list the player reads must have no holes. pages: Map(offset → records).
// Takes every page that continues the list from `loaded`, removes them from the map, and returns the new records.
export const takeContiguous = (pages, loaded) => {
  const records = [];
  let length = loaded;
  while (pages.has(length)) {
    const page = pages.get(length);
    pages.delete(length);
    if (page.length === 0) break;
    records.push(...page);
    length += page.length;
  }
  return { records, length };
}

// Has ext GPS been loaded far enough for a record at `receivedAtMs`? (done = nothing more to load, or loading gave up)
export const extCovers = ({ done, coveredMs }, receivedAtMs) => done || coveredMs >= receivedAtMs

// Is the buffer ready for playback to (re)start? Needs `frames` records loaded (or all of them) and ext GPS covering the
// last of those. A null `waitFor` means nothing is being waited for.
export const bufferReady = ({ waitFor, loaded, total, records, ext }) => {
  if (waitFor === null) return true;
  const needed = Math.min(waitFor.frames, total || waitFor.frames);
  if (loaded < needed) return false;
  const last = records[needed - 1];
  return !last || extCovers(ext, new Date(last.receivedAt).getTime());
}
