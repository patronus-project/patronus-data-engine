// Chart-ready data. Time series use TRIP TIME (ms of driving, long breaks removed) on x, so a multi-day trip is one
// continuous line; `segments` tell the UI how to turn an x back into a clock time.

const { KEY, SPEED_BANDS, CHART_POINTS, MOVING_KMH } = require('./constants');
const { round, downsample, medianSmooth } = require('./stats');
const { localParts, flowOf } = require('./summary');

const MS_PER_HOUR = 3600000;

// [[tm, value], ...] of one value per frame, thinned for the wire
const series = (frames, pick, digits = 1) => {
    const points = [];
    frames.forEach((f) => {
        const v = pick(f);
        if (v !== null && v !== undefined && Number.isFinite(v)) points.push([f.tm, v]);
    });
    return downsample(points, CHART_POINTS).map(([x, y]) => [x, round(y, digits)]);
};

// Altitude is noisy GPS: median-smooth before drawing
const altitudeSeries = (frames) => {
    const withAlt = frames.filter((f) => f.alt !== null);
    if (withAlt.length < 10) return [];
    const smooth = medianSmooth(withAlt.map((f) => f.alt), 9);
    return downsample(withAlt.map((f, i) => [f.tm, smooth[i]]), CHART_POINTS).map(([x, y]) => [x, round(y, 0)]);
};

// Moving time and distance per speed band: [{ from, to, ms, km }]
const speedBandStats = (intervals) => SPEED_BANDS.map(([from, to]) => {
    let ms = 0;
    let km = 0;
    intervals.forEach(({ a, b, dt }) => {
        if (a.kmh >= from && a.kmh < to && a.kmh > MOVING_KMH) {
            ms += dt;
            km += ((a.kmh + b.kmh) / 2) * (dt / MS_PER_HOUR);
        }
    });
    return { from, to, ms, km: round(km, 1) };
});

// Fuel economy per speed band — where the car is most efficient. km/L from distance over fuel burnt in that band.
const efficiencyBySpeed = (intervals) => SPEED_BANDS.map(([from, to]) => {
    let km = 0;
    let litres = 0;
    intervals.forEach(({ a, b, dt }) => {
        const fa = flowOf(a);
        const fb = flowOf(b);
        if (a.kmh < from || a.kmh >= to || a.kmh <= MOVING_KMH || fa === null || fb === null) return;
        km += ((a.kmh + b.kmh) / 2) * (dt / MS_PER_HOUR);
        litres += ((fa + fb) / 2) * (dt / MS_PER_HOUR);
    });
    return { from, to, km: round(km, 1), litres: round(litres, 2), kmPerL: litres > 0.05 && km >= 2 ? round(km / litres, 2) : null };
});

// Driving by local hour of day: when the trip was actually driven and how fast it went then
const hourOfDay = (intervals) => {
    const bins = Array.from({ length: 24 }, (_, hour) => ({ hour, ms: 0, km: 0 }));
    intervals.forEach(({ a, b, dt }) => {
        if (a.kmh <= MOVING_KMH) return;
        const bin = bins[localParts(a.t).hour];
        bin.ms += dt;
        bin.km += ((a.kmh + b.kmh) / 2) * (dt / MS_PER_HOUR);
    });
    return bins.map((b) => ({ hour: b.hour, ms: b.ms, km: round(b.km, 1), avgKmh: b.ms > 0 ? round(b.km / (b.ms / MS_PER_HOUR), 0) : null }));
};

const buildCharts = ({ frames, intervals, days, segments }) => ({
    speed: series(frames, (f) => f.kmh, 0),
    rpm: series(frames, (f) => (f.v[KEY.rpm] !== undefined ? f.v[KEY.rpm] : null), 0),
    coolant: series(frames, (f) => (f.v[KEY.coolant] !== undefined ? f.v[KEY.coolant] : null), 0),
    fuelLevel: series(frames, (f) => (f.v[KEY.fuelLevel] !== undefined ? f.v[KEY.fuelLevel] : null), 1),
    load: series(frames, (f) => (f.v[KEY.load] !== undefined ? f.v[KEY.load] : null), 0),
    altitude: altitudeSeries(frames),
    distance: series(frames, (f) => f.km, 1),
    segments,
    dayMarks: days.slice(1).map((d) => d.startTm),
    speedBands: speedBandStats(intervals),
    efficiencyBySpeed: efficiencyBySpeed(intervals),
    hourOfDay: hourOfDay(intervals),
    daily: days.map((d) => ({ index: d.index, date: d.date, km: d.km, drivingMs: d.drivingMs, avgKmh: d.avgKmh, maxKmh: d.maxKmh }))
});

module.exports = { buildCharts, speedBandStats, efficiencyBySpeed };
