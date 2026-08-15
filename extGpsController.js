const { tsSync } = require('./utils/tsSync');
const { connect } = require('./persistence/mongoose');
const ObdWithExtGps = require('./persistence/models/obdWithExtGps');

const ingestExternalGps = async (req, res) => {
    try {
        const { payload: formatted, error } = formatGpsPayload(req.body);
        if (error) {
            return res.status(400).json({ error });
        }

        const sync_ts = tsSync(formatted.ts);
        await persistGps(sync_ts, formatted);

        return res.status(200).json({ status: 'success', sync_ts });
    } catch (err) {
        console.error('GPS ingest error:', err.message || err);
        return res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
};

const formatGpsPayload = (body) => {
    if (!body || typeof body !== 'object') {
        return { error: 'GPS payload must be a JSON or form-encoded object' };
    }

    const { lat, lon, acc, ts, spd, alt, dir, act, prov, aid, sat, hdop, pdop, email } = body;
    const missing = ['lat', 'lon', 'ts'].filter((field) => body[field] === undefined || body[field] === null || body[field] === '');
    if (missing.length > 0) {
        return { error: `Missing required GPS fields: ${missing.join(', ')}` };
    }

    if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon))) {
        return { error: 'GPS latitude and longitude must be numeric' };
    }

    // Accuracy describes the quality of a valid fix. Persist low-accuracy fixes so
    // temporary reception problems do not break ingestion; consumers can decide
    // whether a particular fix is accurate enough for their use case.
    return {
        payload: { lat, lon, acc, spd, alt, ts, dir, act, prov, aid, sat, hdop, pdop, email }
    };
};

const persistGps = async (sync_ts, data) => {
    const { email, ...rest } = data;
    await connect();
    const result = await ObdWithExtGps.updateOne(
        { sync_ts, email },
        { $set: { email, extGps: rest, gpsReceivedAt: new Date() } },
        { upsert: true }
    );
    console.log(`GPS upsert [${sync_ts}]:`, result);
};

const persistObd = async (doc) => {
    const sync_ts = tsSync(Number(doc.time));
    const alwaysSet = {
        email:         doc.email,
        v:             doc.v,
        session:       doc.session,
        id:            doc.id,
        time:          doc.time,
        obdReceivedAt: new Date()
    };
    const update = doc.kpis && doc.kpis.length > 0
        ? { $set: { ...alwaysSet, kpis: doc.kpis } }
        : { $set: alwaysSet };
    await connect();
    const result = await ObdWithExtGps.updateOne(
        { sync_ts, email: doc.email },
        update,
        { upsert: true }
    );
    console.log(`OBD upsert [${sync_ts}]:`, result);
};

module.exports = { ingestExternalGps, formatGpsPayload, persistObd };
