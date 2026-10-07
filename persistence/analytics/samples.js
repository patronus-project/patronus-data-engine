// Turns raw OBD records and ext GPS documents into one list of "frames" — what the car and the phone said at each
// ping — with a trip clock (driving time, long breaks removed) that every other analytics module builds on.

const { KEY, LONG_BREAK_MS, MAX_PLAUSIBLE_KMH } = require('./constants');

const BUCKET_MS = 10000; // must match utils/tsSync (the engine's sync_ts bucket)
const MS_TO_KMH = 3.6;

const toNumber = (value) => {
    const raw = Array.isArray(value) ? value[0] : value;
    if (raw === undefined || raw === null || raw === '') return null;
    const n = typeof raw === 'number' ? raw : parseFloat(raw);
    return Number.isFinite(n) ? n : null;
};

// One OBD record -> { t, bucket, v: { key: number } }. Torque sends text and sometimes duplicate arrays.
const toSample = (record) => {
    const v = {};
    (record.kpis || []).forEach((entry) => {
        const key = Object.keys(entry)[0];
        if (!key || key[0] !== 'k') return;
        const n = toNumber(entry[key]);
        if (n !== null) v[key] = n;
    });
    const t = new Date(record.receivedAt).getTime();
    const sensorMs = toNumber(record.time);
    return { t, bucket: Math.floor((sensorMs !== null ? sensorMs : t) / BUCKET_MS) * BUCKET_MS, v };
};

// ext GPS documents -> Map(bucket -> { lat, lon, kmh, alt })
const toFixIndex = (extDocs) => {
    const index = new Map();
    (extDocs || []).forEach((doc) => {
        const g = doc.extGps;
        const lat = toNumber(g && g.lat);
        const lon = toNumber(g && g.lon);
        if (lat === null || lon === null) return;
        const spd = toNumber(g.spd);
        index.set(doc.sync_ts, { lat, lon, kmh: spd === null ? null : spd * MS_TO_KMH, alt: toNumber(g.alt) });
    });
    return index;
};

// The frames: oldest first, one per OBD ping that has a usable time.
//   kmh: the car's own speed, else the ext GPS speed;  lat/lon/alt: ext GPS fix of the same bucket, else Torque's own GPS
//   tm: trip time so far (ms of driving; gaps of a long break or more add nothing, so a night stop doesn't count)
const buildFrames = (records, extDocs) => {
    const fixes = toFixIndex(extDocs);
    const frames = [];
    let tm = 0;
    records.map(toSample).filter((s) => Number.isFinite(s.t)).sort((a, b) => a.t - b.t).forEach((s, i, all) => {
        if (i > 0) {
            const gap = s.t - all[i - 1].t;
            if (gap < LONG_BREAK_MS) tm += gap;
        }
        const fix = fixes.get(s.bucket);
        const obdKmh = s.v[KEY.speed];
        const kmh = obdKmh !== undefined ? obdKmh : (fix && fix.kmh !== null ? fix.kmh : null);
        const torqueLat = s.v[KEY.torqueLat];
        const torqueLon = s.v[KEY.torqueLon];
        frames.push({
            t: s.t,
            tm,
            v: s.v,
            kmh: kmh !== null && kmh >= 0 && kmh <= MAX_PLAUSIBLE_KMH ? kmh : null,
            lat: fix ? fix.lat : (torqueLat !== undefined ? torqueLat : null),
            lon: fix ? fix.lon : (torqueLon !== undefined ? torqueLon : null),
            alt: fix ? fix.alt : null
        });
    });
    return frames;
};

// Consecutive frame pairs with a speed on both and a gap short enough to attribute to driving
const drivingIntervals = (frames, maxGapMs) => {
    const out = [];
    let prev = null;
    frames.forEach((f) => {
        if (f.kmh === null) return;
        if (prev) {
            const dt = f.t - prev.t;
            if (dt > 0 && dt <= maxGapMs) out.push({ a: prev, b: f, dt });
        }
        prev = f;
    });
    return out;
};

module.exports = { toNumber, toSample, toFixIndex, buildFrames, drivingIntervals };
