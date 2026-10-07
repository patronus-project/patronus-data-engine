const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const HOUR = 60 * 60 * 1000;
const T0 = Date.UTC(2026, 5, 1, 0, 0, 0);
const at = (hours) => new Date(T0 + hours * HOUR);

// Everything obd2Persistence reaches for is replaced with in-memory fakes, so findTrips runs without Mongo.
const fakes = { records: [], saved: [] };

const stub = (relative, exports) => {
    const file = require.resolve(path.join('..', relative));
    require.cache[file] = { id: file, filename: file, loaded: true, exports };
};

const inRange = (value, range) => (!range.$gte || value >= range.$gte) && (!range.$lte || value <= range.$lte);
const chain = (rows) => ({ sort() { return this; }, lean() { return this; }, exec: async () => rows });

stub('persistence/mongoose.js', { connect: async () => {} });
stub('extGpsController.js', { persistObd: async () => {} });
stub('persistence/models/obdWithExtGps.js', {});
stub('persistence/models/obd2Event.js', {
    find: (query) => chain(fakes.records.filter((r) =>
        query.$or.some((range) => inRange(r.receivedAt, range.receivedAt || {}))))
});
stub('persistence/models/savedTrip.js', { find: () => chain(fakes.saved) });

const { findTrips } = require('../persistence/obd2Persistence');

const records = (...hours) => hours.map((h) => ({ receivedAt: at(h) }));
const savedTrip = (id, fromH, toH, name) => ({ _id: id, name, description: '', tags: [], startTime: at(fromH), endTime: at(toH) });

test('a saved trip outside the date window is still listed, with its records', async () => {
    fakes.records = records(0, 1, 2, 500, 501, 502);
    fakes.saved = [savedTrip('old', -1, 3, 'Old trip')];

    const trips = await findTrips({ start: at(400), end: at(600) });

    const names = trips.map((t) => t.name || 'auto');
    assert.deepEqual(names, ['auto', 'Old trip']); // newest first: the in-window auto trip, then the saved one
    assert.equal(trips.find((t) => t.name).recordCount, 3);
    assert.equal(trips.find((t) => !t.name).recordCount, 3);
});

test('records outside the window that no saved trip owns are not listed', async () => {
    fakes.records = records(0, 1, 500, 501);
    fakes.saved = [];

    const trips = await findTrips({ start: at(400), end: at(600) });

    assert.equal(trips.length, 1);
    assert.equal(trips[0].recordCount, 2);
});

test('a saved trip inside the window claims its records from the automatic grouping', async () => {
    fakes.records = records(10, 11, 12, 13, 14);
    fakes.saved = [savedTrip('mid', 11.5, 12.5, 'Middle')];

    const trips = await findTrips({ start: at(0), end: at(100) });

    assert.equal(trips.filter((t) => t.savedTripId).length, 1);
    assert.equal(trips.find((t) => t.savedTripId).recordCount, 1);
    assert.deepEqual(trips.filter((t) => !t.savedTripId).map((t) => t.recordCount).sort(), [2, 2]);
});

test('with no saved trips the window alone decides, as before', async () => {
    fakes.records = records(0, 1, 2);
    fakes.saved = [];

    const trips = await findTrips({ start: at(0), end: at(10) });

    assert.equal(trips.length, 1);
    assert.equal(trips[0].savedTripId, undefined);
});
