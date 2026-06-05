const { connect } = require('./mongoose');
const Obd2Event = require('./models/obd2Event');
const ObdWithExtGps = require('./models/obdWithExtGps');
const { persistObd } = require('../extGpsController');

const ROOT_KEYS = new Set(['eml', 'v', 'session', 'id', 'time']);
const TRIP_GAP_MS = 3 * 60 * 60 * 1000;

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

function detectTrips(records) {
    if (records.length === 0) return [];

    const trips = [];
    let tripStart = records[0].receivedAt;
    let tripEnd   = records[0].receivedAt;
    let count     = 1;

    for (let i = 1; i < records.length; i++) {
        const gap = new Date(records[i].receivedAt) - new Date(records[i - 1].receivedAt);
        if (gap > TRIP_GAP_MS) {
            trips.push({ startTime: tripStart, endTime: tripEnd, recordCount: count,
                durationMs: new Date(tripEnd) - new Date(tripStart) });
            tripStart = records[i].receivedAt;
            count     = 0;
        }
        tripEnd = records[i].receivedAt;
        count++;
    }
    trips.push({ startTime: tripStart, endTime: tripEnd, recordCount: count,
        durationMs: new Date(tripEnd) - new Date(tripStart) });

    return trips.reverse().map(function (t, i) {
        return Object.assign({ tripId: 'trip_' + i }, t);
    });
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

// Trip summary — lightweight, only receivedAt fetched
async function findTrips({ start, end } = {}) {
    await connect();
    const where = buildDateWhere(start, end, 'receivedAt');
    const records = await Obd2Event
        .find(where, { receivedAt: 1 })
        .sort({ receivedAt: 1 })
        .lean()
        .exec();
    return detectTrips(records);
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
    findObd2EventsPaged,
    findExtEvents,
    findExtEventsPaged,
};
