// Pure trip grouping (no database): saved trips claim their records first, then whatever is left is
// grouped by silence. Kept apart from obd2Persistence so it can be unit-tested with plain arrays.

// No OBD data for 24 h ends a trip. Shorter silences are breaks inside it: the UI calls 30 min–4 h a short break
// and 4 h–3 days a long break / overnight stop (getTelemetryStatus in frontend/src/components/utils.js).
const TRIP_GAP_MS = 24 * 60 * 60 * 1000;

const toMs = (value) => new Date(value).getTime();

const summarise = (records) => ({
    startTime: records[0].receivedAt,
    endTime: records[records.length - 1].receivedAt,
    recordCount: records.length,
    durationMs: toMs(records[records.length - 1].receivedAt) - toMs(records[0].receivedAt)
});

// records: receivedAt-ascending, each at least { receivedAt }. Returns oldest-first trips without ids.
const groupByGap = (records, gapMs = TRIP_GAP_MS) => {
    const trips = [];
    let run = [];
    records.forEach((record) => {
        if (run.length > 0 && toMs(record.receivedAt) - toMs(run[run.length - 1].receivedAt) > gapMs) {
            trips.push(summarise(run));
            run = [];
        }
        run.push(record);
    });
    if (run.length > 0) trips.push(summarise(run));
    return trips;
};

// Which saved trip (if any) owns a record: the first whose [startTime, endTime] contains it.
// Saved ranges are kept non-overlapping by the CLI, so "first" is only a tie-break.
const claimedBy = (record, savedTrips) => {
    const t = toMs(record.receivedAt);
    return savedTrips.find((s) => t >= toMs(s.startTime) && t <= toMs(s.endTime)) || null;
};

// records: receivedAt-ascending. savedTrips: [{ _id, name, description, tags, startTime, endTime }].
// A saved trip is a hard boundary: automatic trips never span it, so records either side of it are grouped separately.
// Returns newest-first trips with positional tripIds; saved trips carry savedTripId, name, description and tags.
const groupTrips = (records, savedTrips = []) => {
    const claimed = new Map();
    const unclaimedRuns = [];
    let run = [];
    records.forEach((record) => {
        const owner = claimedBy(record, savedTrips);
        if (!owner) {
            run.push(record);
            return;
        }
        if (run.length > 0) {
            unclaimedRuns.push(run);
            run = [];
        }
        const key = String(owner._id);
        if (!claimed.has(key)) claimed.set(key, []);
        claimed.get(key).push(record);
    });
    if (run.length > 0) unclaimedRuns.push(run);

    const automatic = unclaimedRuns.flatMap((r) => groupByGap(r));
    const saved = savedTrips
        .filter((s) => claimed.has(String(s._id)))
        .map((s) => ({
            // Snaps to the actual first/last record inside the entered range (the range is allowed to be generous)
            ...summarise(claimed.get(String(s._id))),
            savedTripId: String(s._id),
            name: s.name,
            description: s.description || '',
            tags: s.tags || []
        }));

    return [...automatic, ...saved]
        .sort((a, b) => toMs(b.startTime) - toMs(a.startTime))
        .map((trip, i) => ({ tripId: 'trip_' + i, ...trip }));
};

module.exports = { TRIP_GAP_MS, groupByGap, groupTrips, claimedBy };
