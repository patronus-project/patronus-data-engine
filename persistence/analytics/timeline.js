// The trip as a list of events in time order: start, breaks, fill-ups, day starts, records, milestones, end.
// Events carry raw numbers and a `type`; the UI words them and formats the clock times in the viewer's timezone.

const { MAX_TIMELINE_EVENTS, KEY } = require('./constants');
const { round } = require('./stats');

const MILESTONE_EVERY_KM = 100;

const event = (t, type, data = {}) => ({ t, type, ...data });

const buildTimeline = ({ frames, breaks, days, summary, engine }) => {
    const events = [];
    const first = frames[0];
    const last = frames[frames.length - 1];
    events.push(event(first.t, 'start', { lat: first.lat, lon: first.lon }));

    days.slice(1).forEach((d) => events.push(event(d.start, 'day-start', { day: d.index, km: round(frames.find((f) => f.t >= d.start).km, 1) })));

    breaks.forEach((b) => events.push(event(b.start, 'break', { ms: b.ms, end: b.end, kind: b.type, km: b.km, lat: b.lat, lon: b.lon })));

    summary.fuel.refuels.forEach((r) => events.push(event(r.t, 'refuel', { km: r.km, fromPct: r.fromPct, toPct: r.toPct, addedL: r.addedL, lat: r.lat, lon: r.lon })));

    if (summary.maxKmhAt) events.push(event(summary.maxKmhAt.t, 'top-speed', { kmh: summary.maxKmh, km: summary.maxKmhAt.km, lat: summary.maxKmhAt.lat, lon: summary.maxKmhAt.lon }));

    const [brake] = summary.driving.harshest.brakes;
    if (brake) events.push(event(brake.t, 'hardest-brake', { g: brake.g, fromKmh: brake.fromKmh, toKmh: brake.toKmh, km: brake.km, lat: brake.lat, lon: brake.lon }));
    const [accel] = summary.driving.harshest.accels;
    if (accel) events.push(event(accel.t, 'hardest-accel', { g: accel.g, fromKmh: accel.fromKmh, toKmh: accel.toKmh, km: accel.km, lat: accel.lat, lon: accel.lon }));

    const stretch = summary.longestStretch;
    if (stretch) events.push(event(stretch.start, 'longest-stretch', { km: stretch.km, ms: stretch.ms, end: stretch.end }));

    const hottest = frames.reduce((best, f) => (f.v[KEY.coolant] !== undefined && (!best || f.v[KEY.coolant] > best.v[KEY.coolant]) ? f : best), null);
    if (hottest && engine.coolant.amber && hottest.v[KEY.coolant] >= engine.coolant.amber) {
        events.push(event(hottest.t, 'peak-coolant', { c: hottest.v[KEY.coolant], km: round(hottest.km, 1), lat: hottest.lat, lon: hottest.lon }));
    }

    summary.expressway.sections.forEach((s) => events.push(event(s.start, 'expressway', { km: s.km, avgKmh: s.avgKmh, ms: s.ms, end: s.end, atKm: s.startKm, lat: s.lat, lon: s.lon })));

    // Every 100 km: when you passed it
    let next = MILESTONE_EVERY_KM;
    frames.forEach((f) => {
        if (f.km >= next) {
            events.push(event(f.t, 'milestone', { km: next, lat: f.lat, lon: f.lon }));
            next += MILESTONE_EVERY_KM;
        }
    });

    events.push(event(last.t, 'end', { lat: last.lat, lon: last.lon, km: round(last.km, 1) }));

    events.sort((a, b) => a.t - b.t);
    if (events.length <= MAX_TIMELINE_EVENTS) return events;
    // Too long (a very long trip): drop milestones first, they are the least informative
    const withoutMilestones = events.filter((e) => e.type !== 'milestone');
    return withoutMilestones.slice(0, MAX_TIMELINE_EVENTS);
};

module.exports = { buildTimeline };
