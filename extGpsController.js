const { tsSync } = require('./utils/tsSync');
const { connect } = require('./persistence/mongoose');
const ObdWithExtGps = require('./persistence/models/obdWithExtGps');

const ingestExternalGps = async (req, res) => {
    try {
        const formatted = formatGpsPayload(req.body);  
        if (!formatted) {
            return res.status(400).json({ error: 'Invalid or incomplete GPS payload' });
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
    const { lat, lon, acc, ts, spd, alt, dir, act, prov, aid, sat, hdop, pdop, email } = body;
    // console.log('Received GPS payload:', body);
    if (!lat || !lon || !ts) return null;
    if (acc > 50) return null;
    return { lat, lon, acc, spd, alt, ts, dir, act, prov, aid, sat, hdop, pdop, email };
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
    const payload = {
        email:         doc.email,
        v:             doc.v,
        session:       doc.session,
        id:            doc.id,
        time:          doc.time,
        kpis:          doc.kpis,
        obdReceivedAt: new Date()
    };
    await connect();
    const result = await ObdWithExtGps.updateOne(
        { sync_ts, email: doc.email },
        { $set: payload },
        { upsert: true }
    );
    console.log(`OBD upsert [${sync_ts}]:`, result);
};

module.exports = { ingestExternalGps, persistObd };

