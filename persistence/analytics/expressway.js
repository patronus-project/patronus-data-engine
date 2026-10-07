// Expressway sections: stretches of sustained high speed. A driving interval is "expressway" when the time-weighted average
// speed over the window around it is at least EXPRESSWAY_AVG_KMH. A consistent cruise at 100-120 km/h averages well above that,
// so one rule covers it; a short burst, or fast-slow-fast traffic that averages under it, does not count.

const { EXPRESSWAY_AVG_KMH, EXPRESSWAY_WINDOW_MS, EXPRESSWAY_MIN_SECTION_KM } = require('./constants');
const { round } = require('./stats');
const { flowOf } = require('./summary');

const MS_PER_HOUR = 3600000;

const kmOf = ({ a, b, dt }) => ((a.kmh + b.kmh) / 2) * (dt / MS_PER_HOUR);

// Sets iv.expressway on every interval: the rolling mean speed (time-weighted) over +/- half a window is at least the threshold
const markRolling = (intervals) => {
    const n = intervals.length;
    const time = [0];
    const speedTime = [0];
    intervals.forEach((iv) => {
        time.push(time[time.length - 1] + iv.dt);
        speedTime.push(speedTime[speedTime.length - 1] + ((iv.a.kmh + iv.b.kmh) / 2) * iv.dt);
    });
    const half = EXPRESSWAY_WINDOW_MS / 2;
    let lo = 0;
    let hi = 0;
    intervals.forEach((iv, i) => {
        const t = iv.a.t;
        while (lo < i && intervals[lo].b.t < t - half) lo++;
        while (hi < n && intervals[hi].a.t <= t + half) hi++;
        const span = time[hi] - time[lo];
        iv.expressway = span > 0 && (speedTime[hi] - speedTime[lo]) / span >= EXPRESSWAY_AVG_KMH;
    });
};

// Consecutive (back to back) expressway intervals grouped into sections
const groupSections = (intervals) => {
    const sections = [];
    let current = null;
    let last = null;
    intervals.forEach((iv) => {
        if (!iv.expressway) { current = null; last = iv; return; }
        if (current && last && last.b === iv.a && last.expressway) {
            current.items.push(iv);
        } else {
            current = { items: [iv] };
            sections.push(current);
        }
        last = iv;
    });
    return sections;
};

// Marks the intervals (iv.expressway) and summarises them. Sections shorter than EXPRESSWAY_MIN_SECTION_KM are not
// expressway at all (a fast patch of a few kilometres is just a fast patch).
const summariseExpressway = (intervals, distanceKm) => {
    markRolling(intervals);
    const sections = [];
    groupSections(intervals).forEach(({ items }) => {
        const km = items.reduce((s, iv) => s + kmOf(iv), 0);
        if (km < EXPRESSWAY_MIN_SECTION_KM) {
            items.forEach((iv) => { iv.expressway = false; });
            return;
        }
        const ms = items.reduce((s, iv) => s + iv.dt, 0);
        const first = items[0].a;
        const lastFrame = items[items.length - 1].b;
        sections.push({
            start: first.t, end: lastFrame.t, km: round(km, 1), ms, avgKmh: round(km / (ms / MS_PER_HOUR), 0),
            startKm: round(first.km, 1), lat: first.lat, lon: first.lon
        });
    });

    const flagged = intervals.filter((iv) => iv.expressway);
    const km = flagged.reduce((s, iv) => s + kmOf(iv), 0);
    const ms = flagged.reduce((s, iv) => s + iv.dt, 0);
    let litres = 0;
    let litresKm = 0;
    flagged.forEach((iv) => {
        const fa = flowOf(iv.a);
        const fb = flowOf(iv.b);
        if (fa === null || fb === null) return;
        litres += ((fa + fb) / 2) * (iv.dt / MS_PER_HOUR);
        litresKm += kmOf(iv);
    });
    const longest = sections.reduce((best, s) => (!best || s.km > best.km ? s : best), null);
    return {
        km: round(km, 1),
        ms,
        sharePct: distanceKm > 0 ? round((km / distanceKm) * 100, 0) : null,
        avgKmh: ms > 0 ? round(km / (ms / MS_PER_HOUR), 0) : null,
        kmPerL: litres > 0.05 && litresKm >= 2 ? round(litresKm / litres, 2) : null,
        sections,
        longest
    };
};

module.exports = { summariseExpressway };
