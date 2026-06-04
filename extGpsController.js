const { tsSync } = require('./utils/tsSync');
const { persistGpsData } = require('./persistence/models/obdWithExtGps');

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
    const { lat, lon, acc, ts, spd, alt } = body;
    console.log('Received GPS payload:', body);
    if (!lat || !lon || !ts) return null;
    if (acc > 50) return null;
    return { lat, lon, acc, spd, alt, ts };
};

const persistGps = async (sync_ts, data) => {
    await persistGpsData({
        sync_ts,
        extGps: data,
        gpsReceivedAt: new Date()
    });
};

const persistObd = async (doc) => {
    const sync_ts = tsSync(Number(doc.time));
    await persistObdData({
        sync_ts,
        email:         doc.email,
        v:             doc.v,
        session:       doc.session,
        id:            doc.id,
        time:          doc.time,
        kpis:          doc.kpis,
        obdReceivedAt: new Date()
    });
};

module.exports = { ingestExternalGps, persistObd };

