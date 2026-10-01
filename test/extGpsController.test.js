const test = require('node:test');
const assert = require('node:assert/strict');

const { formatGpsPayload } = require('../extGpsController');

test('accepts a GPS fix whose reported accuracy is over 50 metres', () => {
    const result = formatGpsPayload({ lat: 12.34, lon: 56.78, ts: 1_786_752_000_000, acc: 75 });

    assert.equal(result.error, undefined);
    assert.equal(result.payload.acc, 75);
});

test('accepts valid zero-valued coordinates', () => {
    const result = formatGpsPayload({ lat: 0, lon: 0, ts: 1_786_752_000_000, acc: 5 });

    assert.equal(result.error, undefined);
    assert.equal(result.payload.lat, 0);
    assert.equal(result.payload.lon, 0);
});

test('reports the required fields missing from a payload', () => {
    assert.deepEqual(
        formatGpsPayload({ acc: 5 }),
        { error: 'Missing required GPS fields: lat, lon, ts' }
    );
});

test('rejects non-numeric coordinates', () => {
    assert.deepEqual(
        formatGpsPayload({ lat: 'north', lon: 56.78, ts: 1_786_752_000_000 }),
        { error: 'GPS latitude and longitude must be numeric' }
    );
});
