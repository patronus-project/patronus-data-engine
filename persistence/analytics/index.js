// Trip analytics: everything the Trip Summary shows, computed once from a trip's raw OBD and ext GPS records.
// Pure (no database, no clock): same records in, same object out. Stored on the saved trip by tripAnalyticsRunner.js.

const { MAX_DRIVING_GAP_MS, STOP_WORTH_LISTING_MS } = require('./constants');
const { round } = require('./stats');
const { buildFrames, drivingIntervals } = require('./samples');
const {
    annotateDistance, findBreaks, splitDays, clockSegments, summariseFuel, summariseElevation, summariseDriving,
    summariseTime, straightLine
} = require('./summary');
const { summariseEngine } = require('./engine');
const { summariseExpressway } = require('./expressway');
const { buildCharts } = require('./charts');
const { buildRoute } = require('./route');
const { buildTimeline } = require('./timeline');
const { buildPlan } = require('./plan');
const { buildHighlights } = require('./highlights');

// Bump when the shape or the meaning of anything below changes: stored analytics with an older version are recomputed.
const ANALYTICS_VERSION = 4;   // 4: highway card is a share of the distance; 3: expressway sections; 2: highway counts from 55 km/h (was 80)

const DEFAULT_SPEED_LIMIT_KMH = 101;
const MS_PER_HOUR = 3600000;

const breakSummary = (breaks) => {
    const longest = breaks.reduce((best, b) => (!best || b.ms > best.ms ? b : best), null);
    return {
        count: breaks.length,
        shortCount: breaks.filter((b) => b.type === 'short').length,
        longCount: breaks.filter((b) => b.type === 'long').length,
        totalMs: breaks.reduce((s, b) => s + b.ms, 0),
        longestMs: longest ? longest.ms : null,
        longest: longest ? { ms: longest.ms, start: longest.start, end: longest.end, km: longest.km, kind: longest.type, lat: longest.lat, lon: longest.lon } : null
    };
};

// records: OBD records { receivedAt, time, kpis } ascending. extDocs: joined ext GPS docs { sync_ts, extGps }.
// thresholds: { coolant: { amber, red }, speedLimitKmh } from data.json (optional).
// Returns null when there is too little data to say anything.
const computeTripAnalytics = ({ records, extDocs = [], thresholds = {} }) => {
    const frames = buildFrames(records, extDocs);
    if (frames.length < 2) return null;

    const intervals = drivingIntervals(frames, MAX_DRIVING_GAP_MS);
    const distanceKm = annotateDistance(frames, intervals);
    const breaks = findBreaks(frames);
    const pauses = findBreaks(frames, STOP_WORTH_LISTING_MS);
    const days = splitDays(frames, intervals);
    const segments = clockSegments(frames);
    const time = summariseTime(frames, intervals);
    const speeds = frames.filter((f) => f.kmh !== null);
    const topFrame = speeds.reduce((best, f) => (!best || f.kmh > best.kmh ? f : best), null);
    const first = frames[0];
    const last = frames[frames.length - 1];

    const summary = {
        startAt: first.t,
        endAt: last.t,
        spanMs: last.t - first.t,
        tripTimeMs: last.tm,        // driving clock with long breaks removed (short pauses still count)
        drivingMs: last.dm,         // time actually at the wheel: only the stretches with pings, no pauses
        distanceKm: round(distanceKm, 1),
        movingMs: time.movingMs,
        idleMs: time.idleMs,
        nightMs: time.nightMs,
        highwayMs: time.highwayMs,
        highwayKm: round(time.highwayKm, 1),
        crawlMs: time.crawlMs,
        stops: time.stops,
        avgMovingKmh: time.movingMs > 0 ? round(distanceKm / (time.movingMs / MS_PER_HOUR), 1) : null,
        maxKmh: topFrame ? round(topFrame.kmh, 0) : null,
        maxKmhAt: topFrame ? { t: topFrame.t, km: round(topFrame.km, 1), lat: topFrame.lat, lon: topFrame.lon } : null,
        longestStretch: time.longestStretch,
        expressway: summariseExpressway(intervals, distanceKm),
        breaks: breakSummary(breaks),
        days,
        fuel: summariseFuel(frames, intervals, distanceKm),
        elevation: summariseElevation(frames),
        driving: summariseDriving(frames, intervals, distanceKm, thresholds.speedLimitKmh || DEFAULT_SPEED_LIMIT_KMH),
        straightLine: straightLine(frames, distanceKm)
    };

    const engine = summariseEngine(frames, { coolant: thresholds.coolant });
    const charts = buildCharts({ frames, intervals, days, segments });
    const plan = buildPlan({ frames, intervals, breaks, summary, efficiency: charts.efficiencyBySpeed, hourOfDay: charts.hourOfDay });

    return {
        version: ANALYTICS_VERSION,
        data: { records: records.length, frames: frames.length, extFixes: extDocs.length, usedGps: frames.filter((f) => f.lat !== null).length },
        summary,
        highlights: buildHighlights({ summary, engine, plan }),
        engine,
        charts,
        route: buildRoute(frames, pauses),
        timeline: buildTimeline({ frames, breaks, days, summary, engine }),
        plan
    };
};

module.exports = { computeTripAnalytics, ANALYTICS_VERSION };
