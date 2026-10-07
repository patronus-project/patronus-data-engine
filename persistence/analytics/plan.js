// "Help plan the same trip": what this drive says about how to drive it again — day splits for a daily driving cap,
// break and fuel cadence, the slow sections, the efficient cruising speed. Everything is derived from this one trip.

const { PLAN_SEGMENTS, STOP_WORTH_LISTING_MS } = require('./constants');
const { median, round } = require('./stats');
const { localParts } = require('./summary');

const MS_PER_HOUR = 3600000;
const DAILY_DRIVING_CAPS_H = [6, 8, 10];
const FILL_AT_FRACTION_OF_RANGE = 0.8;   // refuel with a fifth of the tank still in hand
const MIN_BAND_KM_FOR_EFFICIENCY = 10;
const LONG_STRETCH_MS = 3 * MS_PER_HOUR;
const SUGGESTED_BREAK_EVERY_MS = 2 * MS_PER_HOUR;
const NIGHT_SHARE_WORTH_MENTIONING = 25;

// Distance driven once a given amount of time has been spent at the wheel (the frame at or just after it)
const kmAtWheelTime = (frames, dm) => {
    let lo = 0;
    let hi = frames.length - 1;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (frames[mid].dm < dm) lo = mid + 1; else hi = mid;
    }
    return frames[lo].km;
};

// The same drive split so no day exceeds `capH` hours of driving: [{ day, fromKm, toKm, km, drivingMs }]
const splitByDrivingCap = (frames, totalMs, totalKm, capH) => {
    const capMs = capH * MS_PER_HOUR;
    const days = Math.max(1, Math.ceil(totalMs / capMs));
    const share = totalMs / days;
    return Array.from({ length: days }, (_, i) => {
        const fromKm = i === 0 ? 0 : kmAtWheelTime(frames, i * share);
        const toKm = i === days - 1 ? totalKm : kmAtWheelTime(frames, (i + 1) * share);
        return { day: i + 1, fromKm: round(fromKm, 0), toKm: round(toKm, 0), km: round(toKm - fromKm, 0), drivingMs: Math.round(share) };
    });
};

// Equal-distance slices of the route: where it was slow. Pace is distance over time at the wheel, so a break
// that happens to fall inside a slice doesn't make it look slow.
const routeSegments = (frames, totalKm, intervals) => {
    if (totalKm < 1) return [];
    const size = totalKm / PLAN_SEGMENTS;
    return Array.from({ length: PLAN_SEGMENTS }, (_, i) => {
        const fromKm = i * size;
        const toKm = (i + 1) * size;
        const within = (f) => f.km >= fromKm && (f.km < toKm || (i === PLAN_SEGMENTS - 1 && f.km <= toKm));
        const inside = frames.filter(within);
        const ms = intervals.filter(({ b }) => within(b)).reduce((s, iv) => s + iv.dt, 0);
        if (inside.length < 2 || ms === 0) return { idx: i + 1, fromKm: round(fromKm, 0), toKm: round(toKm, 0), ms: 0, avgKmh: null, lat: null, lon: null };
        const km = inside[inside.length - 1].km - inside[0].km;
        const positioned = inside.find((f) => f.lat !== null);
        return {
            idx: i + 1, fromKm: round(fromKm, 0), toKm: round(toKm, 0), ms,
            avgKmh: ms > 0 ? round(km / (ms / MS_PER_HOUR), 0) : null,
            lat: positioned ? positioned.lat : null, lon: positioned ? positioned.lon : null
        };
    });
};

// Driving between breaks: [{ ms, km }] — how long and how far you went before each stop of 30 min or more
const stretchesBetweenBreaks = (frames, breaks) => {
    const cuts = [0, ...breaks.map((b) => b.index), frames.length];
    const out = [];
    for (let i = 0; i + 1 < cuts.length; i++) {
        const seg = frames.slice(cuts[i], cuts[i + 1]);
        if (seg.length > 1) out.push({ ms: seg[seg.length - 1].dm - seg[0].dm, km: seg[seg.length - 1].km - seg[0].km });
    }
    return out;
};

const bestCruise = (efficiency) => {
    const usable = efficiency.filter((b) => b.kmPerL !== null && b.km >= MIN_BAND_KM_FOR_EFFICIENCY);
    if (usable.length === 0) return null;
    const best = usable.reduce((a, b) => (b.kmPerL > a.kmPerL ? b : a));
    const worst = usable.reduce((a, b) => (b.kmPerL < a.kmPerL ? b : a));
    return { from: best.from, to: best.to, kmPerL: best.kmPerL, worstFrom: worst.from, worstTo: worst.to, worstKmPerL: worst.kmPerL };
};

const hoursByPace = (hourOfDay) => {
    const driven = hourOfDay.filter((h) => h.ms >= 10 * 60000 && h.avgKmh !== null);
    const fastest = [...driven].sort((a, b) => b.avgKmh - a.avgKmh).slice(0, 3).map((h) => ({ hour: h.hour, avgKmh: h.avgKmh }));
    const slowest = [...driven].sort((a, b) => a.avgKmh - b.avgKmh).slice(0, 3).map((h) => ({ hour: h.hour, avgKmh: h.avgKmh }));
    return { fastest, slowest };
};

const MIN_EXPRESSWAY_SHARE_TO_MENTION = 15;

const buildTips = ({ summary, stretches, fuelPlan, segments, cruise, nightPct }) => {
    const tips = [];
    const express = summary.expressway;
    if (express.sharePct >= MIN_EXPRESSWAY_SHARE_TO_MENTION) {
        tips.push({ id: 'expressway', text: `${express.km} km (${express.sharePct}%) of the route ran at expressway pace, averaging ${express.avgKmh} km/h${express.kmPerL ? ` at ${express.kmPerL} km/L` : ''}. Plan the long fast sections around these.` });
    }
    const longest = summary.longestStretch;
    if (longest && longest.ms >= LONG_STRETCH_MS) {
        tips.push({ id: 'break-cadence', text: `Your longest non-stop stretch was ${round(longest.ms / MS_PER_HOUR, 1)} h (${longest.km} km). Plan a break at least every 2 hours.` });
    }
    if (fuelPlan.plannedFillEveryKm) {
        tips.push({ id: 'fuel-cadence', text: `At ${fuelPlan.kmPerL} km/L a full tank is about ${fuelPlan.fullRangeKm} km. Plan to fill up around every ${fuelPlan.plannedFillEveryKm} km.` });
    }
    const slow = segments.filter((s) => s.avgKmh !== null).sort((a, b) => a.avgKmh - b.avgKmh)[0];
    if (slow) tips.push({ id: 'slow-section', text: `Slowest section: km ${slow.fromKm}–${slow.toKm} averaged ${slow.avgKmh} km/h. Budget extra time there.` });
    if (cruise && cruise.worstKmPerL < cruise.kmPerL) {
        tips.push({ id: 'cruise', text: `Most efficient at ${cruise.from}–${cruise.to} km/h (${cruise.kmPerL} km/L) versus ${cruise.worstKmPerL} km/L at ${cruise.worstFrom}–${cruise.worstTo} km/h.` });
    }
    const overnight = summary.breaks.longest && summary.breaks.longest.ms >= 4 * MS_PER_HOUR ? summary.breaks.longest : null;
    if (overnight) tips.push({ id: 'overnight', text: `You stopped for ${round(overnight.ms / MS_PER_HOUR, 1)} h after ${overnight.km} km — a natural place to split the trip.` });
    if (nightPct >= NIGHT_SHARE_WORTH_MENTIONING) tips.push({ id: 'night', text: `${nightPct}% of your driving was after dark. An earlier start would cut that.` });
    return tips;
};

// summary: the object built in index.js; efficiency / hourOfDay: from charts
const buildPlan = ({ frames, intervals, breaks, summary, efficiency, hourOfDay }) => {
    const totalKm = summary.distanceKm;
    const totalMs = frames[frames.length - 1].dm;
    const stretches = stretchesBetweenBreaks(frames, breaks);
    const stretchMs = stretches.map((s) => s.ms);
    const fuel = summary.fuel;
    const fullRangeKm = fuel.estTankL && fuel.kmPerL ? fuel.estTankL * fuel.kmPerL : null;
    const plannedFillEveryKm = fullRangeKm ? round(fullRangeKm * FILL_AT_FRACTION_OF_RANGE, 0) : null;
    const fuelPlan = {
        kmPerL: fuel.kmPerL, estTankL: fuel.estTankL, fullRangeKm: fullRangeKm ? round(fullRangeKm, 0) : null, plannedFillEveryKm,
        fuelNeededL: fuel.kmPerL ? round(totalKm / fuel.kmPerL, 0) : null,
        fillUpsNeeded: plannedFillEveryKm ? Math.max(0, Math.ceil(totalKm / plannedFillEveryKm) - 1) : null,
        fillUpsTaken: fuel.refuels.length
    };
    const segments = routeSegments(frames, totalKm, intervals);
    const cruise = bestCruise(efficiency);
    const nightPct = summary.movingMs > 0 ? round((summary.nightMs / summary.movingMs) * 100, 0) : 0;
    return {
        basis: { distanceKm: totalKm, drivingMs: totalMs, tripTimeMs: summary.tripTimeMs, avgKmh: totalMs > 0 ? round(totalKm / (totalMs / MS_PER_HOUR), 0) : null, daysDriven: summary.days.length },
        dayPlans: DAILY_DRIVING_CAPS_H.map((capH) => ({ capH, days: splitByDrivingCap(frames, totalMs, totalKm, capH) })),
        breaks: {
            taken: breaks.length,
            avgMs: breaks.length ? Math.round(breaks.reduce((s, b) => s + b.ms, 0) / breaks.length) : null,
            medianStretchMs: stretchMs.length ? Math.round(median(stretchMs)) : null,
            longestStretchMs: stretchMs.length ? Math.max(...stretchMs) : null,
            suggestedEveryMs: SUGGESTED_BREAK_EVERY_MS
        },
        fuel: fuelPlan,
        expressway: { km: summary.expressway.km, sharePct: summary.expressway.sharePct, avgKmh: summary.expressway.avgKmh, kmPerL: summary.expressway.kmPerL, sections: summary.expressway.sections.length },
        cruise,
        segments,
        slowSections: segments.filter((s) => s.avgKmh !== null).sort((a, b) => a.avgKmh - b.avgKmh).slice(0, 3),
        stops: breaks.filter((b) => b.ms >= STOP_WORTH_LISTING_MS).map((b) => ({ km: b.km, ms: b.ms, kind: b.type, hour: localParts(b.start).hour, lat: b.lat, lon: b.lon })),
        hours: hoursByPace(hourOfDay),
        tips: buildTips({ summary, stretches, fuelPlan, segments, cruise, nightPct })
    };
};

module.exports = { buildPlan };
