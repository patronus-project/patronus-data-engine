const test = require('node:test');
const assert = require('node:assert/strict');

const { runCli, parseTime } = require('../scripts/saved-trips');

// Scripted conversation: answers are consumed in order; everything printed is collected.
const harness = (answers, storeOverrides = {}) => {
    const queue = [...answers];
    const out = [];
    const asked = [];
    const created = [];
    const removed = [];
    const analyticsFor = [];
    const store = {
        findOverlapping: async () => [],
        recordsIn: async () => ({ count: 1234, first: new Date('2026-06-05T14:50:00Z'), last: new Date('2026-06-08T04:00:00Z') }),
        list: async () => [],
        create: async (doc) => { created.push(doc); return { _id: 'abc123', ...doc }; },
        softDelete: async (id) => { removed.push(id); },
        computeAnalytics: async (id) => { analyticsFor.push(id); return { version: 1, summary: { distanceKm: 12.3, days: [{}], maxKmh: 88 }, highlights: [1, 2, 3] }; },
        ...storeOverrides
    };
    const io = {
        ask: async (q) => { asked.push(q); if (queue.length === 0) throw new Error(`ran out of answers at: ${q}`); return queue.shift(); },
        print: (text) => out.push(text)
    };
    return { io, store, out, asked, created, removed, analyticsFor, text: () => out.join('\n') };
};

test('adds a trip: range, point count, confirmation, then name/description/tags one by one', async () => {
    const h = harness(['1', '2026-06-05 20:00', '2026-06-08 09:30', 'y', 'Pune to Goa', 'Monsoon run', 'highway, solo', 'q']);
    await runCli(h.io, h.store);

    assert.equal(h.created.length, 1);
    assert.equal(h.created[0].name, 'Pune to Goa');
    assert.equal(h.created[0].description, 'Monsoon run');
    assert.deepEqual(h.created[0].tags, ['highway', 'solo']);
    assert.equal(h.created[0].startTime.getTime(), new Date('2026-06-05T20:00').getTime());
    assert.match(h.text(), /1234 OBD records/);
    assert.match(h.text(), /\/replay\?trip=abc123/);
    // details are only asked after the confirmation
    const order = h.asked.map((q) => q.split(' ')[0]);
    assert.ok(order.indexOf('Name:') > order.findIndex((q) => q.startsWith('\nIs')));
});

test('answering no to "Is this the trip?" re-asks the range and saves nothing until confirmed', async () => {
    const h = harness(['1', '2026-06-05 20:00', '2026-06-08 09:30', 'n', '2026-06-05 21:00', '2026-06-08 08:00', 'y', 'Trip', '', '', 'q']);
    await runCli(h.io, h.store);

    assert.equal(h.created.length, 1);
    assert.equal(h.created[0].startTime.getTime(), new Date('2026-06-05T21:00').getTime());
    assert.equal(h.created[0].description, '');
    assert.deepEqual(h.created[0].tags, []);
});

test('a range with no OBD records is rejected and asked again', async () => {
    let calls = 0;
    const h = harness(
        ['1', '2026-06-01 08:00', '2026-06-01 09:00', '2026-06-05 20:00', '2026-06-06 09:00', 'y', 'Real trip', '', '', 'q'],
        { recordsIn: async () => (++calls === 1 ? { count: 0, first: null, last: null } : { count: 50, first: new Date(), last: new Date() }) }
    );
    await runCli(h.io, h.store);

    assert.match(h.text(), /No OBD records fall inside that range/);
    assert.equal(h.created.length, 1);
});

test('a range overlapping a saved trip is rejected', async () => {
    let calls = 0;
    const h = harness(
        ['1', '2026-06-05 20:00', '2026-06-06 09:00', '2026-06-10 08:00', '2026-06-10 18:00', 'y', 'Later trip', '', '', 'q'],
        { findOverlapping: async () => (++calls === 1 ? [{ name: 'Existing' }] : []) }
    );
    await runCli(h.io, h.store);

    assert.match(h.text(), /overlaps saved trip\(s\): "Existing"/);
    assert.equal(h.created[0].name, 'Later trip');
});

test('bad times and a start after the end are re-asked, not fatal', async () => {
    const h = harness(['1', 'tomorrow-ish', '2026-06-08 10:00', '2026-06-05 10:00', '2026-06-05 08:00', '2026-06-08 10:00', 'y', 'T', '', '', 'q']);
    await runCli(h.io, h.store);

    assert.match(h.text(), /isn't a date\/time/);
    assert.match(h.text(), /start must be before the end/);
    assert.equal(h.created.length, 1);
});

test('typing q at the start prompt backs out without saving', async () => {
    const h = harness(['1', 'q', 'q']);
    await runCli(h.io, h.store);

    assert.equal(h.created.length, 0);
    assert.match(h.text(), /Cancelled/);
});

test('the name is required', async () => {
    const h = harness(['1', '2026-06-05 20:00', '2026-06-08 09:30', 'y', '', '   ', 'Finally', '', '', 'q']);
    await runCli(h.io, h.store);

    assert.equal(h.created[0].name, 'Finally');
    assert.match(h.text(), /required/);
});

test('removing a trip asks which one and confirms first', async () => {
    const trips = [
        { _id: 'id1', name: 'One', tags: [], description: '', startTime: new Date('2026-06-01T08:00Z'), endTime: new Date('2026-06-01T12:00Z') },
        { _id: 'id2', name: 'Two', tags: ['x'], description: 'second', startTime: new Date('2026-06-02T08:00Z'), endTime: new Date('2026-06-02T12:00Z') }
    ];
    const h = harness(['3', '2', 'y', 'q'], { list: async () => trips });
    await runCli(h.io, h.store);

    assert.deepEqual(h.removed, ['id2']);
    assert.match(h.text(), /Removed/);
});

test('declining the removal confirmation removes nothing', async () => {
    const trips = [{ _id: 'id1', name: 'One', tags: [], description: '', startTime: new Date(), endTime: new Date() }];
    const h = harness(['3', '1', 'n', 'q'], { list: async () => trips });
    await runCli(h.io, h.store);

    assert.deepEqual(h.removed, []);
});

test('parseTime reads local times, explicit zones and bare dates', () => {
    assert.equal(parseTime('2026-06-05 20:00').getTime(), new Date('2026-06-05T20:00').getTime());
    assert.equal(parseTime('2026-06-05T20:00:00Z').toISOString(), '2026-06-05T20:00:00.000Z');
    assert.equal(parseTime('2026-06-05T20:00+05:30').toISOString(), '2026-06-05T14:30:00.000Z');
    assert.equal(parseTime('2026-06-05').getTime(), new Date('2026-06-05T00:00').getTime());
    // a bare date is the start of the day, or the end of it when used as an end time
    assert.equal(parseTime('2026-06-08', { endOfDay: true }).getTime(), new Date('2026-06-08T23:59:59.999').getTime());
    assert.equal(parseTime('2026-06-08 04:00', { endOfDay: true }).getTime(), new Date('2026-06-08T04:00').getTime());
    assert.throws(() => parseTime('nonsense'), /isn't a date\/time/);
    assert.throws(() => parseTime('  '), /enter a date/);
});

test('after saving, it computes the trip analytics and reports them', async () => {
    const h = harness(['1', '2026-06-05 20:00', '2026-06-08 09:30', 'y', 'Pune to Goa', '', '', 'q']);
    await runCli(h.io, h.store);

    assert.deepEqual(h.analyticsFor, ['abc123']);
    assert.match(h.text(), /Computing trip analytics/);
    assert.match(h.text(), /Analytics ready: 12\.3 km over 1 day\(s\), top speed 88 km\/h, 3 highlights/);
});

test('if the analytics fail, the trip is still saved and the person is told the server will retry', async () => {
    const h = harness(['1', '2026-06-05 20:00', '2026-06-08 09:30', 'y', 'Trip', '', '', 'q'], {
        computeAnalytics: async () => { throw new Error('db hiccup'); }
    });
    await runCli(h.io, h.store);

    assert.equal(h.created.length, 1);
    assert.match(h.text(), /Couldn't compute analytics now \(db hiccup\); the server will do it the next time it starts/);
});

test('a trip with too little data reports that instead of numbers', async () => {
    const h = harness(['1', '2026-06-05 20:00', '2026-06-08 09:30', 'y', 'Trip', '', '', 'q'], {
        computeAnalytics: async () => ({ version: 1, unavailable: true })
    });
    await runCli(h.io, h.store);

    assert.match(h.text(), /Not enough data in that range to analyse/);
});

// ── Regenerate analytics (menu 4 and 5) ─────────────────────────────────────

const twoTrips = () => [
    { _id: 'id1', name: 'One', tags: [], description: '', startTime: new Date('2026-06-01T08:00Z'), endTime: new Date('2026-06-01T12:00Z'), analyticsComputedAt: new Date('2026-06-02T10:00Z') },
    { _id: 'id2', name: 'Two', tags: [], description: '', startTime: new Date('2026-06-02T08:00Z'), endTime: new Date('2026-06-02T12:00Z'), analyticsComputedAt: null }
];

test('regenerate one: lists the trips, asks which, confirms, then recomputes just that one', async () => {
    const h = harness(['4', '2', 'y', 'q'], { list: async () => twoTrips() });
    await runCli(h.io, h.store);

    assert.deepEqual(h.analyticsFor, ['id2']);
    assert.match(h.text(), /analytics: computed/);                     // the list says which trips have analytics
    assert.match(h.text(), /analytics: none yet/);
    assert.match(h.text(), /Analytics ready/);
    assert.equal(h.created.length, 0);
});

test('regenerate one: declining the confirmation, pressing Enter, or a bad number recomputes nothing', async () => {
    const declined = harness(['4', '1', 'n', 'q'], { list: async () => twoTrips() });
    await runCli(declined.io, declined.store);
    const cancelled = harness(['4', '', 'q'], { list: async () => twoTrips() });
    await runCli(cancelled.io, cancelled.store);
    const bad = harness(['4', '9', 'q'], { list: async () => twoTrips() });
    await runCli(bad.io, bad.store);

    assert.deepEqual(declined.analyticsFor, []);
    assert.deepEqual(cancelled.analyticsFor, []);
    assert.deepEqual(bad.analyticsFor, []);
    assert.match(bad.text(), /No trip number 9/);
});

test('regenerate all: one confirmation, then every trip in order with progress', async () => {
    const h = harness(['5', 'y', 'q'], { list: async () => twoTrips() });
    await runCli(h.io, h.store);

    assert.deepEqual(h.analyticsFor, ['id1', 'id2']);
    assert.match(h.text(), /\[1\/2\] One/);
    assert.match(h.text(), /\[2\/2\] Two/);
    assert.match(h.text(), /Done\./);
});

test('regenerate all: declining recomputes nothing', async () => {
    const h = harness(['5', 'n', 'q'], { list: async () => twoTrips() });
    await runCli(h.io, h.store);

    assert.deepEqual(h.analyticsFor, []);
    assert.match(h.text(), /Cancelled/);
});

test('regenerate all: a trip that fails is reported and the rest are still done', async () => {
    const done = [];
    const h = harness(['5', 'y', 'q'], {
        list: async () => twoTrips(),
        computeAnalytics: async (id) => {
            if (id === 'id1') throw new Error('db hiccup');
            done.push(id);
            return { version: 2, summary: { distanceKm: 1, days: [{}], maxKmh: 2 }, highlights: [] };
        }
    });
    await runCli(h.io, h.store);

    assert.deepEqual(done, ['id2']);
    assert.match(h.text(), /Couldn't compute analytics now \(db hiccup\)/);
    assert.match(h.text(), /Done\./);
});

test('regenerate with no saved trips says so', async () => {
    const one = harness(['4', 'q']);
    await runCli(one.io, one.store);
    const all = harness(['5', 'q']);
    await runCli(all.io, all.store);

    assert.match(one.text(), /No saved trips/);
    assert.match(all.text(), /No saved trips/);
    assert.deepEqual([...one.analyticsFor, ...all.analyticsFor], []);
});

test('the menu offers both regenerate options', async () => {
    const h = harness(['q']);
    await runCli(h.io, h.store);

    assert.match(h.text(), /4\) Regenerate one trip's analytics/);
    assert.match(h.text(), /5\) Regenerate all trips' analytics/);
});
