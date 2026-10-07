const { connect } = require('./mongoose');
const Obd2Event = require('./models/obd2Event');
const ObdWithExtGps = require('./models/obdWithExtGps');
const SavedTrip = require('./models/savedTrip');
const { groupTrips } = require('./tripGrouping');
const { persistObd } = require('../extGpsController');

const ROOT_KEYS = new Set(['eml', 'v', 'session', 'id', 'time']);

function toDocument(query) {
    const payload = query || {};
    const email = payload.eml;
    const session = payload.session;
    const id = payload.id;

    if (!email || !session || !id) {
        return null;
    }

    const kpis = [];
    Object.keys(payload).forEach(function (key) {
        if (ROOT_KEYS.has(key)) return;
        kpis.push({ [key]: payload[key] });
    });

    return { email, v: payload.v, session, id, time: payload.time, kpis };
}

function isAllowedUserAgent(ua) {
    return typeof ua === 'string' && /android/i.test(ua) && /SM-/i.test(ua);
}

function buildDateWhere(start, end, field) {
    const where = {};
    if (start || end) {
        where[field] = {};
        if (start) where[field].$gte = new Date(start);
        if (end)   where[field].$lte = new Date(end);
    }
    return where;
}

async function persistObd2Query(query, userAgent) {
    if (!isAllowedUserAgent(userAgent)) {
        return { skipped: true, reason: 'user-agent-not-allowed' };
    }

    const doc = toDocument(query);
    if (!doc) {
        return { skipped: true, reason: 'missing-required-fields' };
    }

    await connect();
    Obd2Event.create(doc).catch(err => console.error('Obd2Event persist failed:', err.message));
    persistObd(doc).catch(err => console.error('obdWithExtGps persist failed:', err.message));
    return { skipped: false };
}

// Live view — latest N records, no date filter
async function findObd2Events(filters) {
    await connect();
    const where = {};
    if (filters && filters.email)   where.email   = filters.email;
    if (filters && filters.session) where.session = filters.session;
    const limit = (filters && filters.limit) ? filters.limit : 100;
    return Obd2Event.find(where).sort({ receivedAt: -1 }).limit(limit).lean().exec();
}

// Every saved (hand-defined) trip, oldest first
async function findSavedTrips() {
    return SavedTrip.find({ isDeleted: { $ne: true } }).sort({ startTime: 1 }).lean().exec();
}

// Trip summary — lightweight, only receivedAt fetched.
// Every saved trip is always listed, whatever the date window (they are curated, so they are never filtered out);
// they claim their records first. The records inside the window that no saved trip owns are grouped by silence.
async function findTrips({ start, end } = {}) {
    await connect();
    const saved = await findSavedTrips();
    const wanted = [buildDateWhere(start, end, 'receivedAt')]
        .concat(saved.map((s) => buildDateWhere(s.startTime, s.endTime, 'receivedAt')));
    const records = await Obd2Event
        .find({ $or: wanted }, { receivedAt: 1 })
        .sort({ receivedAt: 1 })
        .lean()
        .exec();
    return groupTrips(records, saved);
}

// One saved trip as a /api/trips entry (actual first/last record inside its range), or null if it has no records
async function findSavedTripById(id) {
    await connect();
    if (!/^[a-f0-9]{24}$/i.test(String(id))) return null;
    const saved = await SavedTrip.findOne({ _id: id, isDeleted: { $ne: true } }).lean().exec();
    if (!saved) return null;
    const records = await Obd2Event
        .find(buildDateWhere(saved.startTime, saved.endTime, 'receivedAt'), { receivedAt: 1 })
        .sort({ receivedAt: 1 })
        .lean()
        .exec();
    const trips = groupTrips(records, [saved]);
    return trips.find((t) => t.savedTripId === String(saved._id)) || null;
}

// Every OBD receive time in a window as epoch ms — a few bytes each, so the UI can find day boundaries
// of a multi-day trip without downloading the full records.
async function findObdTimeline({ start, end }) {
    await connect();
    const rows = await Obd2Event
        .find(buildDateWhere(start, end, 'receivedAt'), { receivedAt: 1 })
        .sort({ receivedAt: 1 })
        .lean()
        .exec();
    return rows.map((r) => r.receivedAt.getTime());
}

// Paged detail — sliding window for replay
async function findObd2EventsPaged({ start, end, offset = 0, limit = 100 }) {
    await connect();
    const where = buildDateWhere(start, end, 'receivedAt');
    const off = Number(offset);
    const lim = Math.min(Number(limit), 500);
    const [records, total] = await Promise.all([
        Obd2Event.find(where).sort({ receivedAt: 1 }).skip(off).limit(lim).lean().exec(),
        Obd2Event.countDocuments(where)
    ]);
    return { records, total, offset: off, limit: lim };
}

// Ext GPS history — latest N joined docs
async function findExtEvents({ limit = 100 } = {}) {
    await connect();
    return ObdWithExtGps.find({}).sort({ obdReceivedAt: -1 }).limit(limit).lean().exec();
}

// Ext GPS history — paged
async function findExtEventsPaged({ start, end, offset = 0, limit = 100 }) {
    await connect();
    const where = buildDateWhere(start, end, 'obdReceivedAt');
    const off = Number(offset);
    const lim = Math.min(Number(limit), 500);
    const [records, total] = await Promise.all([
        ObdWithExtGps.find(where).sort({ obdReceivedAt: 1 }).skip(off).limit(lim).lean().exec(),
        ObdWithExtGps.countDocuments(where)
    ]);
    return { records, total, offset: off, limit: lim };
}

module.exports = {
    persistObd2Query,
    findObd2Events,
    findTrips,
    findSavedTripById,
    findObdTimeline,
    findObd2EventsPaged,
    findExtEvents,
    findExtEventsPaged,
};
