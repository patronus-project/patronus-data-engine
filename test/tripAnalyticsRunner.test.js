const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// The runner's models and the maths are replaced with in-memory fakes, so it runs without Mongo.
const world = { trips: [], obd: [], ext: [], computeCalls: [], computeResult: undefined, failOnCall: null };

const stub = (relative, exports) => {
    const file = require.resolve(path.join('..', relative));
    require.cache[file] = { id: file, filename: file, loaded: true, exports };
};

const inRange = (value, range) => (!range.$gte || value >= range.$gte) && (!range.$lte || value <= range.$lte);
const cursorOf = (rows) => ({ sort() { return this; }, lean() { return this; }, cursor: () => (async function* () { yield* rows; })() });
const execOf = (value) => ({ lean() { return this; }, exec: async () => value });

stub('persistence/mongoose.js', { connect: async () => {} });
stub('persistence/models/obd2Event.js', { find: (q) => cursorOf(world.obd.filter((r) => inRange(r.receivedAt, q.receivedAt))) });
stub('persistence/models/obdWithExtGps.js', { find: (q) => cursorOf(world.ext.filter((r) => inRange(r.obdReceivedAt, q.obdReceivedAt))) });
stub('persistence/models/savedTrip.js', {
    findOne: (q) => execOf(world.trips.find((t) => String(t._id) === String(q._id) && t.isDeleted !== true) || null),
    find: (q) => execOf(world.trips.filter((t) => t.isDeleted !== true && (t.analyticsVersion === null || t.analyticsVersion === undefined || t.analyticsVersion !== 1)).map((t) => ({ _id: t._id }))),
    updateOne: async (q, update) => { Object.assign(world.trips.find((t) => String(t._id) === String(q._id)), update.$set); }
});
stub('persistence/analytics/index.js', {
    ANALYTICS_VERSION: 1,
    computeTripAnalytics: (input) => {
        world.computeCalls.push(input);
        if (world.failOnCall === world.computeCalls.length) throw new Error('boom');   // 1-based: fail the Nth call
        return world.computeResult === undefined ? { version: 1, summary: { distanceKm: input.records.length } } : world.computeResult;
    }
});

const { computeAndStore, ensureMissingTripAnalytics, getTripAnalytics } = require('../persistence/tripAnalyticsRunner');

const ID_A = 'a'.repeat(24);
const ID_B = 'b'.repeat(24);
const T0 = Date.UTC(2026, 5, 5, 0, 0, 0);
const trip = (id, extra = {}) => ({ _id: id, name: id, startTime: new Date(T0), endTime: new Date(T0 + 3600000), analytics: null, analyticsVersion: null, ...extra });
const obdRow = (min) => ({ receivedAt: new Date(T0 + min * 60000), time: String(T0 + min * 60000), kpis: [{ kd: '60' }, { kff1111: '1' }, { kc: '2000' }, { k5c: '90' }] });
const reset = (trips) => {
    world.trips = trips;
    world.obd = [obdRow(1), obdRow(2), obdRow(3), { ...obdRow(1), receivedAt: new Date(T0 + 5 * 3600000) }];   // the last is outside the trip
    world.ext = [{ obdReceivedAt: new Date(T0 + 2 * 60000), sync_ts: 1, extGps: { lat: 1, lon: 2 }, kpis: [{ huge: 'x' }] }];
    world.computeCalls = [];
    world.computeResult = undefined;
    world.failOnCall = null;
};

test('computing stores the analytics, their version and when they were made on the trip', async () => {
    reset([trip(ID_A)]);
    const result = await computeAndStore(ID_A);

    assert.equal(result.summary.distanceKm, 3);
    assert.equal(world.trips[0].analyticsVersion, 1);
    assert.ok(world.trips[0].analyticsComputedAt instanceof Date);
    assert.deepEqual(world.trips[0].analytics, result);
});

test('only the trip\'s own records are read, and only the Torque keys the analytics use are kept', async () => {
    reset([trip(ID_A)]);
    await computeAndStore(ID_A);

    const input = world.computeCalls[0];
    assert.equal(input.records.length, 3);                                           // the record 5 h later is outside the range
    assert.deepEqual(input.records[0].kpis.map((k) => Object.keys(k)[0]).sort(), ['k5c', 'kc', 'kd']);   // kff1111 dropped
    assert.deepEqual(input.extDocs, [{ sync_ts: 1, extGps: { lat: 1, lon: 2 } }]);   // the joined doc's kpis are not carried
});

test('a trip with too little data stores an "unavailable" marker so it is not retried on every start', async () => {
    reset([trip(ID_A)]);
    world.computeResult = null;
    const result = await computeAndStore(ID_A);

    assert.equal(result.unavailable, true);
    assert.equal(world.trips[0].analyticsVersion, 1);
});

test('an unknown or deleted trip is skipped', async () => {
    reset([trip(ID_A, { isDeleted: true })]);

    assert.equal(await computeAndStore(ID_A), null);
    assert.equal(await computeAndStore(ID_B), null);
    assert.equal(world.computeCalls.length, 0);
});

test('the same trip is never computed twice at once', async () => {
    reset([trip(ID_A)]);
    const [first, second] = await Promise.all([computeAndStore(ID_A), computeAndStore(ID_A)]);

    assert.equal(world.computeCalls.length, 1);
    assert.ok((first === null) !== (second === null), 'exactly one of the two did the work');
});

test('the startup sweep computes trips missing analytics and leaves up-to-date ones alone', async () => {
    reset([trip(ID_A), trip(ID_B, { analytics: { done: true }, analyticsVersion: 1 })]);
    const count = await ensureMissingTripAnalytics();

    assert.equal(count, 1);
    assert.equal(world.computeCalls.length, 1);
    assert.equal(world.trips[0].analyticsVersion, 1);
    assert.deepEqual(world.trips[1].analytics, { done: true });
});

test('one failing trip does not stop the sweep', async () => {
    reset([trip(ID_A), trip(ID_B)]);
    world.failOnCall = 1;
    const originalError = console.error;
    const logged = [];
    console.error = (...args) => logged.push(args.join(' '));
    try {
        await ensureMissingTripAnalytics();
    } finally {
        console.error = originalError;
    }

    assert.equal(world.computeCalls.length, 2);                                       // the second trip was still computed
    assert.ok(logged.some((l) => l.includes('boom')));
    assert.equal(world.trips[0].analyticsVersion, null);                               // the failed one is retried next start
    assert.equal(world.trips[1].analyticsVersion, 1);
});

test('asking for analytics: ready ones are returned, missing ones start a background run and report pending', async () => {
    reset([trip(ID_A, { analytics: { hello: 1 }, analyticsVersion: 1 }), trip(ID_B)]);

    assert.deepEqual(await getTripAnalytics(ID_A), { status: 'ready', analytics: { hello: 1 } });
    assert.equal(world.computeCalls.length, 0);

    assert.deepEqual(await getTripAnalytics(ID_B), { status: 'pending' });
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(world.computeCalls.length, 1);
});

test('analytics from an older version count as missing', async () => {
    reset([trip(ID_A, { analytics: { old: true }, analyticsVersion: 0 })]);

    assert.deepEqual(await getTripAnalytics(ID_A), { status: 'pending' });
});

test('an unknown trip id, or one that is not an id at all, is not found', async () => {
    reset([trip(ID_A)]);

    assert.equal(await getTripAnalytics(ID_B), null);
    assert.equal(await getTripAnalytics('not-an-id'), null);
});
