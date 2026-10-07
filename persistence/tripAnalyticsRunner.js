// Computes a saved trip's analytics from its records and stores them on the trip (savedtrips.analytics).
// Triggered fire-and-forget: when the server starts (any trip missing current analytics), when a summary is asked
// for and isn't there yet, and by scripts/saved-trips.js right after a trip is saved. The ingest path never waits on it.

const { connect } = require('./mongoose');
const SavedTrip = require('./models/savedTrip');
const Obd2Event = require('./models/obd2Event');
const ObdWithExtGps = require('./models/obdWithExtGps');
const { computeTripAnalytics, ANALYTICS_VERSION } = require('./analytics');
const { KEY } = require('./analytics/constants');
const keys = require('../data.json');

// Only these Torque keys are read by the analytics; dropping the rest while streaming keeps a day-long trip small in memory
const NEEDED_KEYS = new Set(Object.values(KEY));

const inFlight = new Set();

const slimRecord = (record) => ({
    receivedAt: record.receivedAt,
    time: record.time,
    kpis: (record.kpis || []).filter((entry) => NEEDED_KEYS.has(Object.keys(entry)[0]))
});

const thresholds = () => {
    const alerts = (id) => (keys.find((k) => k.id === id) || {}).alerts || {};
    return { coolant: alerts(KEY.coolant), speedLimitKmh: alerts(KEY.speed).red };
};

// The trip's records, streamed through a cursor and slimmed as they arrive
const loadTripData = async (trip) => {
    const records = [];
    const extDocs = [];
    const range = (field) => ({ [field]: { $gte: trip.startTime, $lte: trip.endTime } });
    const obd = Obd2Event.find(range('receivedAt'), { receivedAt: 1, time: 1, kpis: 1 }).sort({ receivedAt: 1 }).lean().cursor();
    for await (const record of obd) records.push(slimRecord(record));
    const ext = ObdWithExtGps.find(range('obdReceivedAt'), { sync_ts: 1, extGps: 1 }).lean().cursor();
    for await (const doc of ext) extDocs.push({ sync_ts: doc.sync_ts, extGps: doc.extGps });
    return { records, extDocs };
};

// Computes and stores the analytics for one saved trip. Returns the analytics, or null if the trip is gone or already
// being computed. A trip with too little data stores { version, unavailable: true } so it isn't retried on every start.
const computeAndStore = async (tripId) => {
    const id = String(tripId);
    if (inFlight.has(id)) return null;
    inFlight.add(id);
    try {
        await connect();
        const trip = await SavedTrip.findOne({ _id: id, isDeleted: { $ne: true } }, { analytics: 0 }).lean().exec();
        if (!trip) return null;
        const { records, extDocs } = await loadTripData(trip);
        const analytics = computeTripAnalytics({ records, extDocs, thresholds: thresholds() })
            || { version: ANALYTICS_VERSION, unavailable: true, reason: 'Not enough data in this trip to analyse.' };
        await SavedTrip.updateOne({ _id: id }, { $set: { analytics, analyticsVersion: ANALYTICS_VERSION, analyticsComputedAt: new Date() } });
        return analytics;
    } finally {
        inFlight.delete(id);
    }
};

// Start a computation without waiting for it; failures are logged, never thrown
const computeInBackground = (tripId) => {
    computeAndStore(tripId).catch((err) => console.error(`trip analytics failed for ${tripId}:`, err.message || err));
};

// Every saved trip whose analytics are missing or from an older version, one after another (kept gentle on the database)
const ensureMissingTripAnalytics = async () => {
    await connect();
    const stale = await SavedTrip.find(
        { isDeleted: { $ne: true }, $or: [{ analyticsVersion: null }, { analyticsVersion: { $ne: ANALYTICS_VERSION } }] },
        { _id: 1 }
    ).lean().exec();
    for (const { _id } of stale) {
        try {
            await computeAndStore(_id);
        } catch (err) {
            console.error(`trip analytics failed for ${_id}:`, err.message || err);
        }
    }
    return stale.length;
};

// What /api/trips/saved/:id/analytics answers: { status: 'ready', analytics } | { status: 'pending' } | null (no such trip).
// A trip without current analytics gets a background computation started and is reported as pending.
const getTripAnalytics = async (id) => {
    await connect();
    if (!/^[a-f0-9]{24}$/i.test(String(id))) return null;
    const trip = await SavedTrip.findOne({ _id: id, isDeleted: { $ne: true } }, { analytics: 1, analyticsVersion: 1 }).lean().exec();
    if (!trip) return null;
    if (trip.analytics && trip.analyticsVersion === ANALYTICS_VERSION) return { status: 'ready', analytics: trip.analytics };
    computeInBackground(id);
    return { status: 'pending' };
};

module.exports = { computeAndStore, computeInBackground, ensureMissingTripAnalytics, getTripAnalytics, ANALYTICS_VERSION };
