// The headline numbers of a trip: distance, time, stops, breaks, days, fuel, elevation and driving smoothness.

const {
    KEY, MOVING_KMH, STOPPED_KMH, ENGINE_RUNNING_RPM, HIGH_RPM, HIGHWAY_KMH, CRAWL_KMH,
    SHORT_BREAK_MS, LONG_BREAK_MS, HARD_RATE_KMH_PER_S, HARD_EVENT_MAX_GAP_MS, MIN_RATE_DT_MS, STANDARD_GRAVITY,
    REFUEL_MIN_JUMP_PCT, MIN_FUEL_FIT_DROP_PCT, CO2_KG_PER_LITRE, ELEVATION_SMOOTH_WINDOW, ELEVATION_HYSTERESIS_M,
    TRIP_TZ_OFFSET_MIN, NIGHT_FROM_HOUR, NIGHT_TO_HOUR
} = require('./constants');
const { maxOf, round, medianSmooth, haversineKm } = require('./stats');

const MS_PER_HOUR = 3600000;

// ── Local time helpers ──────────────────────────────────────────────────────

const localParts = (ms) => {
    const d = new Date(ms + TRIP_TZ_OFFSET_MIN * 60000);
    return { date: d.toISOString().slice(0, 10), hour: d.getUTCHours() };
};
const isNightHour = (hour) => hour >= NIGHT_FROM_HOUR || hour < NIGHT_TO_HOUR;

// ── Distance ────────────────────────────────────────────────────────────────

// Writes two running totals onto every frame: km (speed x time over driving intervals) and dm (ms actually at the wheel,
// the same intervals' time). Gaps and breaks add nothing to either. Returns total km. Frames without a usable
// interval carry the totals forward.
const annotateDistance = (frames, intervals) => {
    let km = 0;
    let dm = 0;
    let atKm = 0;
    let atDm = 0;
    const totals = new Map();
    intervals.forEach(({ a, b, dt }) => {
        km += ((a.kmh + b.kmh) / 2) * (dt / MS_PER_HOUR);
        dm += dt;
        totals.set(b, [km, dm]);
    });
    frames.forEach((f) => {
        if (totals.has(f)) [atKm, atDm] = totals.get(f);
        f.km = atKm;
        f.dm = atDm;
    });
    return km;
};

// ── Breaks and days ─────────────────────────────────────────────────────────

// Every silence of at least minMs between pings (default: a short break, 30 min). Shorter ones are 'pause'.
const findBreaks = (frames, minMs = SHORT_BREAK_MS) => {
    const breaks = [];
    for (let i = 1; i < frames.length; i++) {
        const gap = frames[i].t - frames[i - 1].t;
        if (gap >= minMs) {
            const before = frames[i - 1];
            breaks.push({
                start: before.t, end: frames[i].t, ms: gap, type: gap >= LONG_BREAK_MS ? 'long' : gap >= SHORT_BREAK_MS ? 'short' : 'pause',
                lat: before.lat, lon: before.lon, km: round(before.km, 1), index: i
            });
        }
    }
    return breaks;
};

// Driving days: a new one starts after a long break that also crosses local midnight (same rule as the web UI)
const splitDays = (frames, intervals) => {
    const cuts = [0];
    for (let i = 1; i < frames.length; i++) {
        const gap = frames[i].t - frames[i - 1].t;
        if (gap >= LONG_BREAK_MS && localParts(frames[i].t).date !== localParts(frames[i - 1].t).date) cuts.push(i);
    }
    return cuts.map((from, d) => {
        const to = d + 1 < cuts.length ? cuts[d + 1] - 1 : frames.length - 1;
        const first = frames[from];
        const last = frames[to];
        const inDay = intervals.filter(({ b }) => b.t >= first.t && b.t <= last.t);
        const speeds = frames.slice(from, to + 1).map((f) => f.kmh).filter((v) => v !== null);
        const km = last.km - first.km;
        const wheelMs = last.dm - first.dm;
        return {
            index: d + 1, date: localParts(first.t).date, start: first.t, end: last.t, startTm: first.tm, endTm: last.tm,
            km: round(km, 1), drivingMs: wheelMs, tripTimeMs: last.tm - first.tm,
            avgKmh: wheelMs > 0 ? round(km / (wheelMs / MS_PER_HOUR), 1) : null,
            maxKmh: round(maxOf(speeds), 0), fuelUsedL: round(flowLitres(inDay), 2)
        };
    });
};

// Continuous stretches of the trip clock: where wall-clock time maps onto trip time (long gaps are the seams)
const clockSegments = (frames) => {
    const segments = [];
    let start = 0;
    for (let i = 1; i <= frames.length; i++) {
        if (i === frames.length || frames[i].t - frames[i - 1].t >= LONG_BREAK_MS) {
            segments.push({ startAt: frames[start].t, endAt: frames[i - 1].t, startTm: frames[start].tm, endTm: frames[i - 1].tm });
            start = i;
        }
    }
    return segments;
};

// ── Fuel ────────────────────────────────────────────────────────────────────

const flowOf = (frame) => (frame.v[KEY.flowLph] !== undefined ? frame.v[KEY.flowLph] : null);

// Litres burnt over a set of driving intervals, integrated from the fuel-flow reading (L/h)
function flowLitres(intervals) {
    let litres = 0;
    intervals.forEach(({ a, b, dt }) => {
        const fa = flowOf(a);
        const fb = flowOf(b);
        if (fa !== null && fb !== null) litres += ((fa + fb) / 2) * (dt / MS_PER_HOUR);
    });
    return litres;
}

// Tank-level readings (%), smoothed. A fill-up is a sustained rise from the lowest level since the last one: a pump raises
// the gauge a little at a time over several pings, so no single step is big, but the climb from the trough is.
// Fuel used = the NET drop between fill-ups (summing every dip would count gauge noise as fuel burnt).
const REFUEL_PEAK_SLACK_PCT = 1.5;   // the rise is over once the level falls this far below its peak

const findRefuels = (frames) => {
    const withLevel = frames.filter((f) => f.v[KEY.fuelLevel] !== undefined);
    if (withLevel.length < 5) return { refuels: [], consumedPct: null, segments: [] };
    const level = medianSmooth(withLevel.map((f) => f.v[KEY.fuelLevel]), 5);
    const refuels = [];
    const segments = [];       // refuel-free stretches: { startT, endT, dropPct }
    let consumedPct = 0;
    let segmentStart = level[0];
    let segmentStartIdx = 0;
    let trough = level[0];
    let troughIdx = 0;
    let peak = null;           // null = not in a fill-up
    let peakIdx = 0;

    const closeSegment = (endIdx) => {
        const dropPct = Math.max(0, segmentStart - trough);
        consumedPct += dropPct;
        segments.push({ startT: withLevel[segmentStartIdx].t, endT: withLevel[endIdx].t, dropPct });
    };
    const finishRefuel = () => {
        const at = withLevel[troughIdx];
        closeSegment(troughIdx);
        refuels.push({ t: at.t, lat: at.lat, lon: at.lon, km: round(at.km, 1), fromPct: trough, toPct: peak });
        segmentStart = peak;
        segmentStartIdx = peakIdx;
    };

    for (let i = 1; i < level.length; i++) {
        if (peak === null) {
            if (level[i] < trough) {
                trough = level[i];
                troughIdx = i;
            } else if (level[i] - trough >= REFUEL_MIN_JUMP_PCT) {
                peak = level[i];
                peakIdx = i;
            }
        } else if (level[i] >= peak - REFUEL_PEAK_SLACK_PCT) {
            if (level[i] > peak) { peak = level[i]; peakIdx = i; }
        } else {
            finishRefuel();
            trough = level[i];
            troughIdx = i;
            peak = null;
        }
    }
    if (peak !== null) {
        finishRefuel();
        trough = peak;
        troughIdx = peakIdx;
    }
    const lastIdx = level.length - 1;
    if (level[lastIdx] < trough) { trough = level[lastIdx]; troughIdx = lastIdx; }
    closeSegment(troughIdx);
    return { refuels, consumedPct, segments };
};

const summariseFuel = (frames, intervals, distanceKm) => {
    const usedL = flowLitres(intervals);
    const hasFlow = frames.some((f) => flowOf(f) !== null) && usedL > 0.05;
    const { refuels, consumedPct, segments } = findRefuels(frames);
    // Tank size: litres burnt over the single biggest refuel-free drop, scaled to 100%. One long clean drop fits far
    // better than pooling every stretch, because the short ones carry the gauge's rounding and top-up noise.
    const biggest = segments.reduce((best, seg) => (!best || seg.dropPct > best.dropPct ? seg : best), null);
    const fitL = biggest ? flowLitres(intervals.filter(({ b }) => b.t >= biggest.startT && b.t <= biggest.endT)) : 0;
    const tankL = hasFlow && biggest && biggest.dropPct >= MIN_FUEL_FIT_DROP_PCT && fitL > 0.05 ? (fitL / biggest.dropPct) * 100 : null;
    const sizedRefuels = refuels.map((r) => ({
        ...r, addedPct: round(r.toPct - r.fromPct, 0), addedL: tankL ? round(((r.toPct - r.fromPct) / 100) * tankL, 1) : null,
        fromPct: round(r.fromPct, 0), toPct: round(r.toPct, 0)
    }));
    const first = frames.find((f) => f.v[KEY.fuelLevel] !== undefined);
    const last = [...frames].reverse().find((f) => f.v[KEY.fuelLevel] !== undefined);
    return {
        usedL: hasFlow ? round(usedL, 1) : null,
        kmPerL: hasFlow ? round(distanceKm / usedL, 2) : null,
        lPer100Km: hasFlow && distanceKm > 0 ? round((usedL / distanceKm) * 100, 2) : null,
        tankStartPct: first ? round(first.v[KEY.fuelLevel], 0) : null,
        tankEndPct: last ? round(last.v[KEY.fuelLevel], 0) : null,
        consumedPct: consumedPct === null ? null : round(consumedPct, 0),
        estTankL: tankL ? round(tankL, 0) : null,
        co2Kg: hasFlow ? round(usedL * CO2_KG_PER_LITRE, 1) : null,
        refuels: sizedRefuels
    };
};

// ── Elevation ───────────────────────────────────────────────────────────────

const summariseElevation = (frames) => {
    const withAlt = frames.filter((f) => f.alt !== null);
    if (withAlt.length < 10) return { gainM: null, lossM: null, maxM: null, minM: null, maxAt: null };
    const alt = medianSmooth(withAlt.map((f) => f.alt), ELEVATION_SMOOTH_WINDOW);
    let ref = alt[0];
    let gain = 0;
    let loss = 0;
    alt.forEach((a) => {
        if (a - ref >= ELEVATION_HYSTERESIS_M) { gain += a - ref; ref = a; }
        else if (ref - a >= ELEVATION_HYSTERESIS_M) { loss += ref - a; ref = a; }
    });
    const maxM = maxOf(alt);
    return {
        gainM: round(gain, 0), lossM: round(loss, 0), maxM: round(maxM, 0), minM: round(Math.min(...alt), 0),
        maxAt: withAlt[alt.indexOf(maxM)].t
    };
};

// ── Driving smoothness ──────────────────────────────────────────────────────

const REV_PENALTY_PER_PCT = 0.5;

const summariseDriving = (frames, intervals, distanceKm, speedLimitKmh) => {
    const hard = [];
    intervals.forEach(({ a, b, dt }) => {
        if (dt > HARD_EVENT_MAX_GAP_MS) return;
        const rate = (b.kmh - a.kmh) / (Math.max(dt, MIN_RATE_DT_MS) / 1000);
        if (Math.abs(rate) >= HARD_RATE_KMH_PER_S) {
            hard.push({ t: b.t, type: rate > 0 ? 'accel' : 'brake', fromKmh: round(a.kmh, 0), toKmh: round(b.kmh, 0), g: round(Math.abs(rate) / 3.6 / STANDARD_GRAVITY, 2), lat: b.lat, lon: b.lon, km: round(b.km, 1) });
        }
    });
    const accel = hard.filter((e) => e.type === 'accel');
    const brake = hard.filter((e) => e.type === 'brake');
    const movingMs = intervals.filter(({ a }) => a.kmh > MOVING_KMH).reduce((s, i) => s + i.dt, 0);
    const speedingMs = intervals.filter(({ a }) => a.kmh >= speedLimitKmh).reduce((s, i) => s + i.dt, 0);
    const running = frames.filter((f) => (f.v[KEY.rpm] || 0) > ENGINE_RUNNING_RPM);
    const highRevPct = running.length ? (running.filter((f) => f.v[KEY.rpm] > HIGH_RPM).length / running.length) * 100 : null;
    const speedingPct = movingMs > 0 ? (speedingMs / movingMs) * 100 : null;
    const per10Km = distanceKm >= 1 ? (hard.length / distanceKm) * 10 : null;
    const penalty = (value, perUnit, cap) => (value === null ? 0 : Math.min(cap, value * perUnit));
    const score = distanceKm >= 1
        ? Math.max(0, Math.round(100 - penalty(per10Km, 5, 40) - penalty(speedingPct, 1, 30) - penalty(highRevPct, REV_PENALTY_PER_PCT, 20)))
        : null;
    const top = (list) => [...list].sort((x, y) => y.g - x.g).slice(0, 5);
    return {
        score, label: score === null ? null : score >= 80 ? 'smooth' : score >= 60 ? 'mixed' : 'rough',
        hardAccel: accel.length, hardBrake: brake.length, hardPer100Km: per10Km === null ? null : round(per10Km * 10, 1),
        speedingPct: round(speedingPct, 1), speedLimitKmh, highRevPct: round(highRevPct, 1),
        harshest: { brakes: top(brake), accels: top(accel) }
    };
};

// ── Time use ────────────────────────────────────────────────────────────────

// Moving / idling / night / highway / stop-and-go time and the longest non-stop stretch
const summariseTime = (frames, intervals) => {
    let movingMs = 0, idleMs = 0, nightMs = 0, highwayMs = 0, highwayKm = 0, crawlMs = 0, stops = 0;
    let best = { km: 0, ms: 0, start: null, end: null, startKm: 0 };
    let run = null;
    let lastB = null;
    intervals.forEach(({ a, b, dt }) => {
        const moving = a.kmh > MOVING_KMH;
        if (moving) {
            movingMs += dt;
            if (isNightHour(localParts(a.t).hour)) nightMs += dt;
            if (a.kmh >= HIGHWAY_KMH) {
                highwayMs += dt;
                highwayKm += ((a.kmh + b.kmh) / 2) * (dt / MS_PER_HOUR);
            }
            if (a.kmh < CRAWL_KMH) crawlMs += dt;
        } else if ((a.v[KEY.rpm] || 0) > ENGINE_RUNNING_RPM) {
            idleMs += dt;
        }
        if (moving && b.kmh <= STOPPED_KMH) stops++;
        if (lastB !== a || a.kmh <= STOPPED_KMH) run = null;
        if (a.kmh > STOPPED_KMH) {
            if (!run) run = { km: 0, ms: 0, start: a.t, startKm: a.km };
            run.km += ((a.kmh + b.kmh) / 2) * (dt / MS_PER_HOUR);
            run.ms += dt;
            run.end = b.t;
            if (run.ms > best.ms) best = { ...run };
        }
        lastB = b;
    });
    return { movingMs, idleMs, nightMs, highwayMs, highwayKm, crawlMs, stops, longestStretch: best.ms > 0 ? { km: round(best.km, 1), ms: best.ms, start: best.start, end: best.end, startKm: round(best.startKm, 1) } : null };
};

// Straight line from start to end vs the distance actually driven ("route efficiency")
const straightLine = (frames, distanceKm) => {
    const withPos = frames.filter((f) => f.lat !== null && f.lon !== null);
    if (withPos.length < 2) return { km: null, efficiencyPct: null };
    const km = haversineKm([withPos[0].lat, withPos[0].lon], [withPos[withPos.length - 1].lat, withPos[withPos.length - 1].lon]);
    return { km: round(km, 1), efficiencyPct: distanceKm > 0 ? round((km / distanceKm) * 100, 0) : null };
};

module.exports = {
    localParts, annotateDistance, findBreaks, splitDays, clockSegments, summariseFuel, summariseElevation,
    summariseDriving, summariseTime, straightLine, flowLitres, flowOf
};
