const test = require('node:test');
const assert = require('node:assert/strict');

const { computeTripAnalytics, ANALYTICS_VERSION } = require('../persistence/analytics');

// ── Synthetic trips ─────────────────────────────────────────────────────────
// Pings every 5 s. A record is { receivedAt, time, kpis: [{ key: 'value' }, ...] } like the API returns.

const PING_MS = 5000;
const HOUR = 3600000;
const MIN = 60000;
const T0 = Date.UTC(2026, 5, 5, 3, 0, 0);   // 08:30 IST on 5 Jun

const record = (t, values) => ({
    receivedAt: new Date(t).toISOString(),
    time: String(t),
    kpis: Object.entries(values).map(([k, v]) => ({ [k]: String(v) }))
});

// A run of pings from `start` for `durationMs`, values from fn(secondsIntoRun)
const run = (start, durationMs, fn) => {
    const out = [];
    for (let t = start; t <= start + durationMs; t += PING_MS) out.push(record(t, fn((t - start) / 1000)));
    return out;
};

const cruise = (kmh, extra = {}) => () => ({ kd: kmh, kc: 2000, ...extra });
const analyse = (records, extDocs = []) => computeTripAnalytics({ records, extDocs, thresholds: { coolant: { amber: 95, red: 100 }, speedLimitKmh: 101 } });

// ── Distance and time ───────────────────────────────────────────────────────

test('60 km/h for an hour is 60 km, an hour at the wheel', () => {
    const a = analyse(run(T0, HOUR, cruise(60)));

    assert.equal(a.summary.distanceKm, 60);
    assert.equal(a.summary.drivingMs, HOUR);
    assert.equal(a.summary.maxKmh, 60);
    assert.equal(a.summary.avgMovingKmh, 60);
    assert.equal(a.version, ANALYTICS_VERSION);
});

test('a 45 minute break counts in trip time but not at the wheel, and is reported as a short break', () => {
    const records = [...run(T0, HOUR, cruise(60)), ...run(T0 + HOUR + 45 * MIN, HOUR, cruise(60))];
    const a = analyse(records);

    assert.equal(a.summary.drivingMs, 2 * HOUR);                      // only the stretches with pings
    assert.equal(a.summary.tripTimeMs, 2 * HOUR + 45 * MIN);          // short breaks stay on the trip clock
    assert.equal(a.summary.distanceKm, 120);
    assert.equal(a.summary.breaks.count, 1);
    assert.equal(a.summary.breaks.shortCount, 1);
    assert.equal(a.summary.breaks.longCount, 0);
    assert.equal(a.summary.breaks.longestMs, 45 * MIN);
});

test('an overnight stop splits the days, is a long break, and is left out of the trip clock', () => {
    const day2 = T0 + 21 * HOUR;                                      // 05:30 IST next morning... after crossing IST midnight
    const a = analyse([...run(T0, 2 * HOUR, cruise(60)), ...run(day2, HOUR, cruise(60))]);

    assert.equal(a.summary.days.length, 2);
    assert.equal(a.summary.days[0].km, 120);
    assert.equal(a.summary.days[1].km, 60);
    assert.equal(a.summary.breaks.longCount, 1);
    assert.ok(a.summary.tripTimeMs < 3 * HOUR + MIN);                 // the ~19 h stop adds nothing
    assert.equal(a.charts.segments.length, 2);
    assert.equal(a.charts.dayMarks.length, 1);
    // the second segment starts where the first ended on the trip clock
    assert.equal(a.charts.segments[1].startTm, a.charts.segments[0].endTm);
});

test('the trip clock x of a chart can be mapped back to wall time through the segments', () => {
    const day2 = T0 + 21 * HOUR;
    const a = analyse([...run(T0, 2 * HOUR, cruise(60)), ...run(day2, HOUR, cruise(60))]);
    const seg = a.charts.segments[1];
    const lastPoint = a.charts.speed[a.charts.speed.length - 1];

    assert.equal(seg.startAt + (lastPoint[0] - seg.startTm), seg.endAt);
});

test('moving, idling and stop counts', () => {
    // 10 min at 60, stop for 5 min with the engine on (idle), then 10 more at 60
    const records = [
        ...run(T0, 10 * MIN, cruise(60)),
        ...run(T0 + 10 * MIN + PING_MS, 5 * MIN, () => ({ kd: 0, kc: 800 })),
        ...run(T0 + 15 * MIN + 2 * PING_MS, 10 * MIN, cruise(60))
    ];
    const a = analyse(records);

    assert.equal(a.summary.stops, 1);
    assert.ok(Math.abs(a.summary.idleMs - 5 * MIN) < 30 * 1000);
    assert.ok(a.summary.movingMs > 19 * MIN);
});

test('night share counts moving time between 7 pm and 5 am IST', () => {
    const night = Date.UTC(2026, 5, 5, 16, 30, 0);                    // 22:00 IST
    const a = analyse([...run(T0, 30 * MIN, cruise(60)), ...run(night, 30 * MIN, cruise(60))]);

    assert.ok(Math.abs(a.summary.nightMs - 30 * MIN) < 60 * 1000);
});

// ── Fuel ────────────────────────────────────────────────────────────────────

test('fuel burnt, km/L, and the tank size from the level drop', () => {
    // 2 h at 60 km/h burning 6 L/h = 12 L over 120 km; the gauge goes 100% -> 73.33% (45 L tank)
    const records = run(T0, 2 * HOUR, (s) => ({ kd: 60, kc: 2000, kff125d: 6, k2f: 100 - (26.667 * s) / (2 * 3600) }));
    const a = analyse(records);

    assert.equal(a.summary.fuel.usedL, 12);
    assert.equal(a.summary.fuel.kmPerL, 10);
    assert.equal(a.summary.fuel.lPer100Km, 10);
    assert.ok(Math.abs(a.summary.fuel.estTankL - 45) <= 1);
    assert.equal(a.summary.fuel.co2Kg, 27.7);
    assert.equal(a.summary.fuel.refuels.length, 0);
});

test('a gradual fill-up (a few points per ping) is found, and fuel used is the net drop around it', () => {
    // Drive 100% -> 50%, pump up to 100% over 3 minutes, drive 100% -> 70%
    const level = [];
    for (let i = 0; i < 360; i++) level.push(100 - (50 * i) / 359);              // 30 min of driving, 5 s pings
    for (let i = 1; i <= 36; i++) level.push(50 + (50 * i) / 36);                // 3 min of pumping
    for (let i = 1; i <= 360; i++) level.push(100 - (30 * i) / 360);
    const records = level.map((l, i) => record(T0 + i * PING_MS, { kd: i >= 360 && i < 396 ? 0 : 60, kc: 2000, kff125d: 5, k2f: l }));
    const a = analyse(records);

    assert.equal(a.summary.fuel.refuels.length, 1);
    assert.ok(Math.abs(a.summary.fuel.refuels[0].fromPct - 50) <= 2);
    assert.equal(a.summary.fuel.refuels[0].toPct, 100);
    assert.ok(Math.abs(a.summary.fuel.consumedPct - 80) <= 2);                   // 50 + 30, not counting the 50-point fill
});

test('gauge noise is not counted as fuel burnt and does not create fill-ups', () => {
    const records = run(T0, HOUR, (s) => ({ kd: 60, kc: 2000, kff125d: 5, k2f: 80 - s / 3600 * 10 + (Math.round(s / 5) % 2 ? 1.5 : -1.5) }));
    const a = analyse(records);

    assert.equal(a.summary.fuel.refuels.length, 0);
    assert.ok(a.summary.fuel.consumedPct <= 12);
});

// ── Driving, engine, elevation ──────────────────────────────────────────────

test('a hard brake is counted once, with its g, and bursty pings do not inflate it', () => {
    // 100 -> 40 km/h in one 5 s ping = 12 km/h per s = 0.34 g; then two pings 200 ms apart that must not count
    const records = [
        record(T0, { kd: 100, kc: 2500 }), record(T0 + 5000, { kd: 40, kc: 1500 }),
        record(T0 + 10000, { kd: 40, kc: 1500 }), record(T0 + 10200, { kd: 50, kc: 1500 })
    ];
    const a = analyse(records);

    assert.equal(a.summary.driving.hardBrake, 1);
    assert.equal(a.summary.driving.hardAccel, 0);
    assert.ok(Math.abs(a.summary.driving.harshest.brakes[0].g - 0.34) < 0.02);
});

test('coolant above the amber line is timed', () => {
    const a = analyse(run(T0, HOUR, (s) => ({ kd: 60, kc: 2000, k5: s < 1800 ? 90 : 97 })));

    assert.equal(a.engine.coolant.max, 97);
    assert.ok(Math.abs(a.engine.coolant.msAboveAmber - 30 * MIN) < 30 * 1000);
    assert.equal(a.engine.coolant.msAboveRed, 0);
});

test('elevation: GPS noise adds no climb, a real 100 m climb does', () => {
    const noisy = run(T0, HOUR, () => ({ kd: 60, kc: 2000 })).map((r, i) => ({ sync_ts: Math.floor(Number(r.time) / 10000) * 10000, extGps: { lat: 22 + i * 1e-5, lon: 88, alt: 300 + (i % 2 ? 2 : -2) } }));
    const flat = analyse(run(T0, HOUR, () => ({ kd: 60, kc: 2000 })), noisy);
    assert.equal(flat.summary.elevation.gainM, 0);

    const climbing = run(T0, HOUR, () => ({ kd: 60, kc: 2000 })).map((r, i, all) => ({ sync_ts: Math.floor(Number(r.time) / 10000) * 10000, extGps: { lat: 22 + i * 1e-5, lon: 88, alt: 300 + (100 * i) / all.length } }));
    const hill = analyse(run(T0, HOUR, () => ({ kd: 60, kc: 2000 })), climbing);
    assert.ok(hill.summary.elevation.gainM >= 90 && hill.summary.elevation.gainM <= 105);
});

// ── Output ──────────────────────────────────────────────────────────────────

test('too little data gives null, not a half-empty object', () => {
    assert.equal(analyse([]), null);
    assert.equal(analyse([record(T0, { kd: 60 })]), null);
});

test('the analytics object is JSON-safe, small, and carries every section the summary needs', () => {
    const records = [...run(T0, 3 * HOUR, (s) => ({ kd: 50 + 30 * Math.sin(s / 300), kc: 2000, k5: 92, kff125d: 5, k2f: 90 - s / 3600 * 4 })), ...run(T0 + 22 * HOUR, 2 * HOUR, cruise(70, { kff125d: 5, k2f: 70 }))];
    const ext = records.map((r, i) => ({ sync_ts: Math.floor(Number(r.time) / 10000) * 10000, extGps: { lat: 22 + i * 2e-5, lon: 88 + i * 1e-5, spd: 15, alt: 300 } }));
    const a = analyse(records, ext);
    const json = JSON.stringify(a);

    assert.ok(json.length < 200 * 1024, `analytics too large: ${json.length} bytes`);
    assert.deepEqual(Object.keys(a).sort(), ['charts', 'data', 'engine', 'highlights', 'plan', 'route', 'summary', 'timeline', 'version']);
    assert.ok(a.highlights.length >= 8);
    assert.ok(a.highlights.every((h) => h.id && h.label && h.value !== null && h.value !== undefined));
    assert.ok(a.charts.speed.length <= 240 && a.charts.speed.length > 10);
    assert.ok(a.route.points.length <= 400 && a.route.points.length > 10);
    assert.equal(a.timeline[0].type, 'start');
    assert.equal(a.timeline[a.timeline.length - 1].type, 'end');
    assert.ok(a.timeline.every((e, i, all) => i === 0 || e.t >= all[i - 1].t), 'timeline is in time order');
    assert.deepEqual(JSON.parse(json), JSON.parse(JSON.stringify(a)));
});

test('the plan splits the trip by a daily driving cap, with day distances adding up', () => {
    const a = analyse(run(T0, 12 * HOUR, cruise(60)));
    const eight = a.plan.dayPlans.find((p) => p.capH === 8);

    assert.equal(eight.days.length, 2);                                // 12 h at the wheel, 8 h cap -> 2 days
    assert.equal(eight.days.reduce((s, d) => s + d.km, 0), 720);
    assert.equal(eight.days[0].toKm, eight.days[1].fromKm);
    assert.equal(a.plan.dayPlans.find((p) => p.capH === 6).days.length, 2);
    assert.equal(a.plan.dayPlans.find((p) => p.capH === 10).days.length, 2);
});

test('plan segments report pace from time at the wheel, so a break inside a slice does not make it look slow', () => {
    const records = [...run(T0, HOUR, cruise(60)), ...run(T0 + HOUR + 2 * HOUR, HOUR, cruise(60))];   // a 2 h break in the middle
    const a = analyse(records);
    const speeds = a.plan.segments.map((s) => s.avgKmh).filter((v) => v !== null);

    assert.ok(speeds.length >= 18);
    assert.ok(speeds.every((v) => v >= 58 && v <= 62), `segment speeds: ${speeds.join(',')}`);
});

test('repeated runs on the same records give the same analytics', () => {
    const records = run(T0, 2 * HOUR, (s) => ({ kd: 60 + (s % 600) / 20, kc: 2000 }));

    assert.deepEqual(analyse(records), analyse(records));
});

test('highway driving counts from 55 km/h (India\'s highways average about that): 60 is highway, 50 is not', () => {
    const a = analyse([...run(T0, 30 * MIN, cruise(60)), ...run(T0 + 30 * MIN + PING_MS, 30 * MIN, cruise(50))]);
    const share = a.summary.highwayMs / a.summary.movingMs;

    assert.ok(Math.abs(share - 0.5) < 0.02, `highway share was ${share}`);
    assert.match(a.highlights.find((h) => h.id === 'highway').detail, /55 km\/h or more/);
});

// ── Expressway: a sustained rolling average of 85 km/h or more ──────────────

test('a consistent 100 km/h cruise is expressway; the slow stretch between two of them is not', () => {
    const a = analyse([
        ...run(T0, 30 * MIN, cruise(100)),
        ...run(T0 + 30 * MIN + PING_MS, 30 * MIN, cruise(60)),
        ...run(T0 + 60 * MIN + 2 * PING_MS, 30 * MIN, cruise(110)),
    ]);
    const e = a.summary.expressway;

    assert.equal(e.sections.length, 2);
    assert.ok(Math.abs(e.km - 105) < 6, `expressway km was ${e.km}`);                 // 50 km + 55 km, give or take the edges of the window
    assert.ok(e.longest.km > 50 && e.longest.km < 60);
    assert.ok(e.avgKmh >= 100 && e.avgKmh <= 110);
    assert.ok(e.sharePct > 72 && e.sharePct < 82, `share was ${e.sharePct}`);   // 104 of 135 km driven
});

test('fast-slow-fast traffic that averages 85 or more still counts, one that averages under it does not', () => {
    const swing = (fast, slow) => (s) => ({ kd: Math.floor(s / 60) % 2 ? fast : slow, kc: 2000 });
    const quick = analyse(run(T0, 40 * MIN, swing(110, 70)));        // averages 90
    const sluggish = analyse(run(T0, 40 * MIN, swing(100, 40)));     // averages 70

    assert.equal(quick.summary.expressway.sections.length, 1);
    assert.ok(quick.summary.expressway.km > 55);
    assert.equal(sluggish.summary.expressway.km, 0);
});

test('a short burst of speed in ordinary driving is not an expressway', () => {
    const a = analyse([
        ...run(T0, 20 * MIN, cruise(60)),
        ...run(T0 + 20 * MIN + PING_MS, 3 * MIN, cruise(100)),
        ...run(T0 + 23 * MIN + 2 * PING_MS, 20 * MIN, cruise(60)),
    ]);

    assert.equal(a.summary.expressway.km, 0);
    assert.equal(a.summary.expressway.sections.length, 0);
    assert.equal(a.summary.expressway.longest, null);
    assert.ok(!a.highlights.some((h) => h.id === 'expressway'));
});

test('the expressway shows up as a highlight, a timeline event, a plan figure and a tip, with its own economy', () => {
    const a = analyse(run(T0, HOUR, () => ({ kd: 100, kc: 2500, kff125d: 8 })));

    assert.equal(a.summary.expressway.kmPerL, 12.5);                    // 100 km/h at 8 L/h
    const card = a.highlights.find((h) => h.id === 'expressway');
    assert.ok(card && card.value > 95);
    assert.match(card.detail, /12\.5 km\/L/);
    assert.ok(a.timeline.some((e) => e.type === 'expressway'));
    assert.equal(a.plan.expressway.sections, 1);
    assert.ok(a.plan.tips.some((t) => t.id === 'expressway'));
});

test('highway pace (55 km/h) and expressway pace (85 km/h average) are separate measures', () => {
    const a = analyse(run(T0, 30 * MIN, cruise(70)));

    assert.ok(a.summary.highwayMs > 0.9 * a.summary.movingMs);          // 70 km/h counts as highway...
    assert.equal(a.summary.expressway.km, 0);                           // ...but is not an expressway
});

test('the Highway driving card is a share of the distance driven, with the kilometres in its detail', () => {
    // 30 min at 60 km/h (30 km, highway pace) then 30 min at 50 km/h (25 km, not): 30 of 55 km
    const a = analyse([...run(T0, 30 * MIN, cruise(60)), ...run(T0 + 30 * MIN + PING_MS, 30 * MIN, cruise(50))]);
    const card = a.highlights.find((h) => h.id === 'highway');

    assert.ok(Math.abs(a.summary.highwayKm - 30) < 0.5, `highwayKm was ${a.summary.highwayKm}`);   // the 5 s step from 60 to 50 counts as highway pace
    assert.equal(card.value, 55);                                      // 30 / 55 km, not the share of time (which is ~50%)
    assert.equal(card.unit, '%');
    assert.match(card.detail, /30 of 55 km driven at 55 km\/h or more/);
});

test('a trip with no highway pace shows 0% of the distance, not a missing card', () => {
    const a = analyse(run(T0, 30 * MIN, cruise(40)));

    assert.equal(a.summary.highwayKm, 0);
    assert.equal(a.highlights.find((h) => h.id === 'highway').value, 0);
});
