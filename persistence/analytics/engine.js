// What the engine and electrics were doing: temperatures, load, revs, battery voltage, warm-up.

const { KEY, ENGINE_RUNNING_RPM, HIGH_RPM, RPM_BANDS, MAX_DRIVING_GAP_MS } = require('./constants');
const { mean, maxOf, minOf, round, percentile } = require('./stats');

const COLD_START_MAX_C = 60;      // first coolant reading at or below this = the trip began with a cold engine
const WARM_COOLANT_C = 75;
const VOLTAGE_LOW = 12.8;         // below this with the engine running is a weak charging system
const VOLTAGE_CRITICAL = 12.0;

const values = (frames, key, keep = () => true) => frames.filter((f) => f.v[key] !== undefined && keep(f)).map((f) => f.v[key]);
const isRunning = (f) => (f.v[KEY.rpm] || 0) > ENGINE_RUNNING_RPM;

// Time (ms) spent at or above a level, from consecutive pings
const msAtOrAbove = (frames, key, level) => {
    let ms = 0;
    for (let i = 1; i < frames.length; i++) {
        const dt = frames[i].t - frames[i - 1].t;
        const v = frames[i - 1].v[key];
        if (dt > 0 && dt <= MAX_DRIVING_GAP_MS && v !== undefined && v >= level) ms += dt;
    }
    return ms;
};

const statsOf = (xs, digits = 0) => ({ avg: round(mean(xs), digits), min: round(minOf(xs), digits), max: round(maxOf(xs), digits) });

const warmup = (frames) => {
    const temps = frames.filter((f) => f.v[KEY.coolant] !== undefined);
    if (temps.length === 0 || temps[0].v[KEY.coolant] > COLD_START_MAX_C) return { coldStart: false, minutes: null };
    const warm = temps.find((f) => f.v[KEY.coolant] >= WARM_COOLANT_C);
    return { coldStart: true, minutes: warm ? round((warm.t - temps[0].t) / 60000, 1) : null };
};

// Time in each rpm band while the engine runs: [{ from, to, ms }]
const rpmBandTimes = (frames) => RPM_BANDS.map(([from, to]) => {
    let ms = 0;
    for (let i = 1; i < frames.length; i++) {
        const dt = frames[i].t - frames[i - 1].t;
        const r = frames[i - 1].v[KEY.rpm];
        if (dt > 0 && dt <= MAX_DRIVING_GAP_MS && r !== undefined && r >= from && r < to) ms += dt;
    }
    return { from, to, ms };
});

// thresholds: { coolant: { amber, red }, ... } from data.json (optional)
const summariseEngine = (frames, thresholds = {}) => {
    const running = frames.filter(isRunning);
    const voltageKey = frames.some((f) => f.v[KEY.voltageEcu] !== undefined) ? KEY.voltageEcu : KEY.voltageAdapter;
    const voltage = values(running, voltageKey);
    const coolant = thresholds.coolant || {};
    const rpm = values(running, KEY.rpm);
    return {
        coolant: {
            ...statsOf(values(frames, KEY.coolant), 0), amber: coolant.amber || null, red: coolant.red || null,
            msAboveAmber: coolant.amber ? msAtOrAbove(frames, KEY.coolant, coolant.amber) : null,
            msAboveRed: coolant.red ? msAtOrAbove(frames, KEY.coolant, coolant.red) : null
        },
        oil: statsOf(values(frames, KEY.oil), 0),
        load: statsOf(values(running, KEY.load), 0),
        throttle: statsOf(values(running, KEY.throttle), 0),
        rpm: { ...statsOf(rpm, 0), highPct: rpm.length ? round((rpm.filter((r) => r > HIGH_RPM).length / rpm.length) * 100, 1) : null },
        voltage: {
            ...statsOf(voltage, 2),
            typicalLow: round(percentile(voltage, 0.02), 2),
            lowPct: voltage.length ? round((voltage.filter((v) => v < VOLTAGE_LOW).length / voltage.length) * 100, 1) : null,
            criticalPct: voltage.length ? round((voltage.filter((v) => v < VOLTAGE_CRITICAL).length / voltage.length) * 100, 1) : null
        },
        intake: statsOf(values(frames, KEY.intake), 0),
        ambient: statsOf(values(frames, KEY.ambient), 0),
        warmup: warmup(frames),
        rpmBands: rpmBandTimes(frames)
    };
};

module.exports = { summariseEngine };
