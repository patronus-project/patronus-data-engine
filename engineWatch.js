// Observe-only ingest watcher.
// Records what the OBD and GPS endpoints already did, evaluates "something broke mid-drive" rules every minute,
// and pushes state changes to a PUBLIC ntfy topic. It never changes what gets written, never throws into the
// request path, and never sends coordinates, emails, session ids, user agents or raw database errors.
const mongoose = require('mongoose');

const NTFY_URL = 'https://ntfy.sh';
const NTFY_TOPIC = process.env.NTFY_TOPIC || 'patronus-watch-location-engine';
// On wherever the engine runs; set NTFY_DISABLED=true to turn it off
const NTFY_DISABLED = process.env.NTFY_DISABLED === 'true';

const EVAL_INTERVAL_MS = 60 * 1000;
const MOVING_KMH = 10;                       // a ping above this counts as driving
const FRESH_MS = 2 * 60 * 1000;              // a stream that pinged within this is "alive"
const SILENT_MS = 5 * 60 * 1000;             // a stream silent this long mid-drive is "stopped"
const DRIVE_IDLE_END_MS = 15 * 60 * 1000;    // pings arriving but stationary this long → drive over
const DRIVE_DARK_END_MS = 60 * 60 * 1000;    // no pings at all this long → drive over
const FROZEN_FIXES = 6;                      // identical ext GPS fixes in a row while OBD says moving (~1 min)
const OBD_MOVING_KMH = 5;
const EVENT_COOLDOWN_MS = 30 * 60 * 1000;    // repeat alerts for the same event at most this often
const MS_TO_KMH = 3.6;
const READY_STATES = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };

const freshStream = () => ({ lastPingAt: null, lastSpeedKmh: null, received: 0, errors: 0 });

const createState = () => ({
    startedAt: Date.now(),
    obd: { ...freshStream(), accepted: 0, skipped: {} },
    gps: { ...freshStream(), accepted: 0, rejected: 0, lastFix: null, sameFixRun: 0 },
    drive: null,
    alerts: new Set(),
    events: {},
});

let state = createState();
let clock = () => Date.now();
let sink = null;   // test hook: receives every notification instead of ntfy/console

const firstOf = (v) => (Array.isArray(v) ? v[0] : v);
const toNum = (v) => {
    const n = parseFloat(firstOf(v));
    return Number.isFinite(n) ? n : null;
};
const mins = (ms) => Math.round(ms / 60000);
const fmtKmh = (kmh) => (kmh == null ? 'unknown' : `${Math.round(kmh)} km/h`);
const iso = (t) => (t == null ? null : new Date(t).toISOString());
// Error class/code only — raw Mongo messages can include cluster host names, and the topic is public
const errLabel = (err) => (err && (err.codeName || err.code || err.name)) || 'Error';

// Every public entry point goes through this: the watcher must never break ingest
const safe = (fn) => {
    try {
        return fn();
    } catch (err) {
        console.log('[engine-watch] internal error:', err && err.message);
        return undefined;
    }
};

const notify = (title, message, { priority = 'default', tags = [] } = {}) => {
    if (sink) return sink({ title, message, priority, tags });
    console.log(`[engine-watch] ${title} | ${message}`);
    if (NTFY_DISABLED || typeof fetch !== 'function') return;
    // Header values must stay ASCII (titles here are); emoji go in Tags
    fetch(`${NTFY_URL}/${NTFY_TOPIC}`, {
        method: 'POST',
        body: message,
        headers: { Title: title, Priority: priority, Tags: tags.join(',') },
        signal: AbortSignal.timeout(5000),
    }).catch((err) => console.log('[engine-watch] ntfy publish failed:', err.message));
};

// One-off events (skipped pings, rejected payloads): first one alerts, repeats are counted into the next alert
const notifyEvent = (key, title, message, opts) => {
    const now = clock();
    const last = state.events[key];
    if (last && now - last.at < EVENT_COOLDOWN_MS) {
        last.suppressed++;
        return;
    }
    const extra = last && last.suppressed ? ` (+${last.suppressed} more in the last ${mins(now - last.at)} min)` : '';
    state.events[key] = { at: now, suppressed: 0 };
    notify(title, message + extra, opts);
};

// Conditions (silence, frozen GPS, DB down): alert when entering, "Resolved" when leaving, nothing in between
const setCondition = (key, active, title, message, resolvedMessage, opts) => {
    if (active && !state.alerts.has(key)) {
        state.alerts.add(key);
        notify(title, message, opts);
    } else if (!active && state.alerts.has(key)) {
        state.alerts.delete(key);
        notify(`Resolved: ${title}`, resolvedMessage, { priority: 'default', tags: ['white_check_mark'] });
    }
};

const isFresh = (t, now) => t != null && now - t < FRESH_MS;
const obdMoving = (now) => isFresh(state.obd.lastPingAt, now) && state.obd.lastSpeedKmh != null && state.obd.lastSpeedKmh > OBD_MOVING_KMH;

const onPing = (source, speedKmh, now) => {
    const moving = speedKmh != null && speedKmh > MOVING_KMH;
    if (!state.drive && moving) {
        state.drive = {
            startedAt: now, lastMovingAt: now, lastAnyPingAt: now,
            obdPings: 0, gpsPings: 0, gpsRejected: 0, maxKmh: 0, longestGapMs: 0,
        };
        notify('Drive started',
            `Detected via ${source === 'obd' ? 'OBD' : 'ext GPS'} at ${fmtKmh(speedKmh)}. OBD connected: ${isFresh(state.obd.lastPingAt, now) ? 'yes' : 'not yet'}.`,
            { priority: 'low', tags: ['car'] });
    }
    const d = state.drive;
    if (!d) return;
    d.longestGapMs = Math.max(d.longestGapMs, now - d.lastAnyPingAt);
    d.lastAnyPingAt = now;
    d[source === 'obd' ? 'obdPings' : 'gpsPings']++;
    if (moving) d.lastMovingAt = now;
    if (speedKmh != null) d.maxKmh = Math.max(d.maxKmh, speedKmh);
};

const clearDriveConditions = () => ['dark', 'obd-stopped', 'gps-stopped'].forEach((k) => state.alerts.delete(k));

const endDrive = (reason) => {
    const d = state.drive;
    notify('Drive summary',
        `${mins(d.lastMovingAt - d.startedAt)} min moving | OBD pings ${d.obdPings} | GPS pings ${d.gpsPings}`
        + ` | GPS rejected ${d.gpsRejected} | max ${fmtKmh(d.maxKmh)} | longest gap ${mins(d.longestGapMs)} min | ended: ${reason}`,
        { priority: 'low', tags: ['checkered_flag'] });
    state.drive = null;
    clearDriveConditions();
};

const evaluate = () => safe(() => {
    const now = clock();
    const age = (t) => (t == null ? Infinity : now - t);
    const obdAge = age(state.obd.lastPingAt);
    const gpsAge = age(state.gps.lastPingAt);
    const anyAge = Math.min(obdAge, gpsAge);
    const d = state.drive;

    if (d) {
        const lastKmh = obdAge <= gpsAge ? state.obd.lastSpeedKmh : state.gps.lastSpeedKmh;
        setCondition('dark', anyAge > SILENT_MS, 'No data mid-drive',
            `Nothing from OBD or GPS for ${mins(anyAge)} min during a drive (last speed ${fmtKmh(lastKmh)}). Check the phone, its data connection and both apps.`,
            'Data is arriving again.', { priority: 'high', tags: ['rotating_light'] });
        setCondition('obd-stopped', d.obdPings > 0 && obdAge > SILENT_MS && gpsAge < FRESH_MS, 'OBD stopped mid-drive',
            `No OBD ping for ${mins(obdAge)} min while ext GPS is still arriving. Check Torque and the OBD adapter.`,
            'OBD pings are arriving again.', { priority: 'high', tags: ['warning'] });
        setCondition('gps-stopped', d.gpsPings > 0 && gpsAge > SILENT_MS && obdAge < FRESH_MS, 'Ext GPS stopped mid-drive',
            `No GPS ping for ${mins(gpsAge)} min while OBD is still arriving. Check GPSLogger.`,
            'Ext GPS pings are arriving again.', { priority: 'high', tags: ['satellite'] });

        if (anyAge > DRIVE_DARK_END_MS) endDrive('no data for 60 min');
        else if (anyAge < SILENT_MS && now - d.lastMovingAt > DRIVE_IDLE_END_MS) endDrive('stationary for 15 min');
    }

    setCondition('ext-frozen', state.gps.sameFixRun >= FROZEN_FIXES, 'Ext GPS frozen',
        `${state.gps.sameFixRun} identical ext GPS fixes in a row while OBD reads ${fmtKmh(state.obd.lastSpeedKmh)}. The live map will stop moving.`,
        'Ext GPS position is moving again.', { priority: 'high', tags: ['satellite'] });
});

// ── Hooks called from index.js ────────────────────────────────────────────────

const recordObdPing = (query) => safe(() => {
    const now = clock();
    const o = state.obd;
    o.received++;
    o.lastPingAt = now;
    const kmh = toNum(query && query.kd);   // metadata pings carry no kd; keep the last known speed
    if (kmh != null) o.lastSpeedKmh = kmh;
    onPing('obd', kmh, now);
});

const recordObdResult = (result) => safe(() => {
    if (!result || !result.skipped) {
        state.obd.accepted++;
        return;
    }
    const reason = result.reason || 'unknown';
    state.obd.skipped[reason] = (state.obd.skipped[reason] || 0) + 1;
    notifyEvent(`obd-skip:${reason}`, 'OBD ping not saved',
        `Reason: ${reason}. Torque is reaching the engine but the ping is being dropped.`,
        { priority: 'high', tags: ['warning'] });
});

const recordObdError = (err) => safe(() => {
    state.obd.errors++;
    notifyEvent('obd-error', 'OBD save failed', `Persistence error: ${errLabel(err)}.`, { priority: 'high', tags: ['rotating_light'] });
});

const recordGpsResult = (status, body) => safe(() => {
    const now = clock();
    const g = state.gps;
    g.received++;
    if (status >= 500) {
        g.errors++;
        notifyEvent('gps-error', 'GPS save failed', `GPS ingest answered HTTP ${status}.`, { priority: 'high', tags: ['rotating_light'] });
        return;
    }
    if (status >= 400) {
        g.rejected++;
        if (state.drive) state.drive.gpsRejected++;
        notifyEvent('gps-rejected', 'GPS ping rejected',
            `GPS ingest answered HTTP ${status}: payload failed validation (missing lat/lon/ts or non-numeric coordinates).`,
            { priority: 'default', tags: ['warning'] });
        return;
    }
    g.accepted++;
    g.lastPingAt = now;
    const spd = toNum(body && body.spd);
    const kmh = spd == null ? null : spd * MS_TO_KMH;
    if (kmh != null) g.lastSpeedKmh = kmh;
    // Coordinates stay in memory for freeze detection and never leave the process
    const lat = toNum(body && body.lat);
    const lon = toNum(body && body.lon);
    const fix = lat != null && lon != null ? `${lat.toFixed(5)},${lon.toFixed(5)}` : null;
    g.sameFixRun = fix != null && fix === g.lastFix && obdMoving(now) ? g.sameFixRun + 1 : 0;
    g.lastFix = fix;
    onPing('gps', kmh, now);
});

// Express middleware for the GPS route: observes the controller's response without touching it
const observeGps = (req, res, next) => {
    res.on('finish', () => recordGpsResult(res.statusCode, req.body));
    next();
};

const recordMongoConnectFailure = (err) => safe(() => {
    notifyEvent('mongo-connect', 'Database connection failed',
        `Engine could not connect to MongoDB at startup (${errLabel(err)}). Telemetry will not be saved.`,
        { priority: 'high', tags: ['rotating_light'] });
});

const watchMongo = () => {
    const c = mongoose.connection;
    const down = (active) => setCondition('mongo', active, 'Database disconnected',
        'Engine lost its MongoDB connection; writes fail until it reconnects.',
        'MongoDB connection restored.', { priority: 'high', tags: ['rotating_light'] });
    c.on('disconnected', () => safe(() => down(true)));
    c.on('connected', () => safe(() => down(false)));
    c.on('reconnected', () => safe(() => down(false)));
};

const start = () => safe(() => {
    watchMongo();
    notify('Engine started',
        `Patronus engine is up at ${iso(state.startedAt)}. A start you didn't trigger means it crashed or was restarted.`,
        { priority: 'low', tags: ['rocket'] });
    setInterval(evaluate, EVAL_INTERVAL_MS).unref();
});

// ── /api/health ───────────────────────────────────────────────────────────────
// Liveness only: everything comes from process memory and the driver's connection state — no database query.
// After a restart the ingest section starts empty; the "Engine started" alert covers that case.

const getHealth = (req, res) => {
    const now = clock();
    const d = state.drive;
    const mongo = READY_STATES[mongoose.connection.readyState] || 'unknown';
    const body = {
        status: mongo !== 'connected' ? 'degraded' : state.alerts.size > 0 ? 'alerting' : 'ok',
        serverTime: iso(now),
        uptimeSec: Math.round((now - state.startedAt) / 1000),
        mongo,
        ingest: {
            sinceStart: iso(state.startedAt),
            obd: {
                lastPingAt: iso(state.obd.lastPingAt), lastSpeedKmh: state.obd.lastSpeedKmh,
                received: state.obd.received, accepted: state.obd.accepted, skipped: state.obd.skipped, errors: state.obd.errors,
            },
            gps: {
                lastPingAt: iso(state.gps.lastPingAt), lastSpeedKmh: state.gps.lastSpeedKmh,
                received: state.gps.received, accepted: state.gps.accepted, rejected: state.gps.rejected, errors: state.gps.errors,
            },
        },
        drive: d ? { active: true, startedAt: iso(d.startedAt), obdPings: d.obdPings, gpsPings: d.gpsPings } : { active: false },
        activeAlerts: [...state.alerts],
    };
    res.set('Cache-Control', 'no-store');
    res.status(200).json(body);
};

module.exports = {
    start,
    recordObdPing,
    recordObdResult,
    recordObdError,
    observeGps,
    recordMongoConnectFailure,
    getHealth,
    // Test hooks: deterministic clock, captured notifications, clean state
    __test: {
        evaluate,
        recordGpsResult,
        getState: () => state,
        setClock: (fn) => { clock = fn; },
        setSink: (fn) => { sink = fn; },
        reset: () => { state = createState(); state.startedAt = clock(); },
    },
};
