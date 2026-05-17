const { connect } = require('./mongoose');
const Obd2Event = require('./models/obd2Event');

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
        if (ROOT_KEYS.has(key)) {
            return;
        }
        kpis.push({ [key]: payload[key] });
    });

    return {
        email: email,
        v: payload.v,
        session: session,
        id: id,
        time: payload.time,
        kpis: kpis
    };
}

function isAllowedUserAgent(ua) {
    return typeof ua === 'string' && /android/i.test(ua) && /SM-/i.test(ua);
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
    await Obd2Event.create(doc);
    return { skipped: false };
}

async function findObd2Events(filters) {
    await connect();
    const where = {};

    if (filters && filters.email) {
        where.email = filters.email;
    }
    if (filters && filters.session) {
        where.session = filters.session;
    }

    const limit = filters && filters.limit ? filters.limit : 100;
    return Obd2Event.find(where).sort({ receivedAt: -1 }).limit(limit).lean().exec();
}

module.exports = {
    persistObd2Query: persistObd2Query,
    findObd2Events: findObd2Events
};
