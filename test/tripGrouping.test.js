const test = require('node:test');
const assert = require('node:assert/strict');

const { groupTrips, groupByGap, TRIP_GAP_MS } = require('../persistence/tripGrouping');

const HOUR = 60 * 60 * 1000;
const T0 = Date.UTC(2026, 5, 5, 0, 0, 0);
const at = (hours) => ({ receivedAt: new Date(T0 + hours * HOUR) });
const saved = (id, fromH, toH, extra = {}) => ({
    _id: id, name: `trip ${id}`, startTime: new Date(T0 + fromH * HOUR), endTime: new Date(T0 + toH * HOUR), ...extra
});

test('records less than 24 h apart stay one trip; a longer silence starts a new one', () => {
    const trips = groupByGap([at(0), at(23), at(23.5), at(23.5 + 25)]);

    assert.equal(trips.length, 2);
    assert.equal(trips[0].recordCount, 3);
    assert.equal(trips[1].recordCount, 1);
    assert.equal(TRIP_GAP_MS, 24 * HOUR);
});

test('without saved trips, trips come back newest first with positional ids', () => {
    const trips = groupTrips([at(0), at(1), at(40), at(41)]);

    assert.deepEqual(trips.map((t) => t.tripId), ['trip_0', 'trip_1']);
    assert.equal(trips[0].recordCount, 2);
    assert.equal(new Date(trips[0].startTime).getTime(), T0 + 40 * HOUR);
    assert.equal(trips[0].savedTripId, undefined);
});

test('a saved trip claims the records inside its range and carries its details', () => {
    const records = [at(0), at(1), at(2), at(3), at(4)];
    const trips = groupTrips(records, [saved('aaa', 1.5, 3.5, { description: 'Goa run', tags: ['solo'] })]);

    const named = trips.find((t) => t.savedTripId === 'aaa');
    assert.equal(named.name, 'trip aaa');
    assert.equal(named.description, 'Goa run');
    assert.deepEqual(named.tags, ['solo']);
    assert.equal(named.recordCount, 2); // hours 2 and 3
    assert.equal(new Date(named.startTime).getTime(), T0 + 2 * HOUR); // actual first record, not the rough bound
});

test('a saved trip is a hard boundary: records either side are never merged across it', () => {
    const records = [at(0), at(1), at(5), at(6), at(10), at(11)];
    const trips = groupTrips(records, [saved('mid', 4, 7)]);

    assert.equal(trips.length, 3);
    const automatic = trips.filter((t) => !t.savedTripId);
    assert.deepEqual(automatic.map((t) => t.recordCount), [2, 2]); // not one 4-record trip jumping the saved one
});

test('records outside every saved trip still follow the gap rule', () => {
    const records = [at(0), at(1), at(50), at(51), at(52)];
    const trips = groupTrips(records, [saved('x', 50, 52)]);

    assert.equal(trips.length, 2);
    assert.equal(trips.filter((t) => t.savedTripId).length, 1);
    assert.equal(trips.find((t) => !t.savedTripId).recordCount, 2);
});

test('a saved trip with no records in range is left out', () => {
    const trips = groupTrips([at(0), at(1)], [saved('empty', 30, 40)]);

    assert.equal(trips.length, 1);
    assert.equal(trips[0].savedTripId, undefined);
});

test('the range bounds are inclusive', () => {
    const trips = groupTrips([at(2), at(3)], [saved('edge', 2, 3)]);

    assert.equal(trips.length, 1);
    assert.equal(trips[0].recordCount, 2);
});

test('no records gives no trips', () => {
    assert.deepEqual(groupTrips([], [saved('a', 0, 1)]), []);
});
