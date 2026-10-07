const test = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../frontend/src/components/utils.js');

// A record in the shape the API returns: kpis is a list of one-key objects
const obdRecord = (lat, lon, time = '1786752000000') => ({
    time,
    receivedAt: '2026-06-05T08:00:00Z',
    kpis: [
        ...(lat === undefined ? [] : [{ kff1006: String(lat) }, { kff1005: String(lon) }]),
        { kd: '40' }
    ]
});

test('track points keep one entry per record, in order, with no thinning', async () => {
    const { getTrackPoints } = await load();
    const records = Array.from({ length: 700 }, (_, i) => obdRecord(22 + i / 1000, 88));
    const points = getTrackPoints(records);

    assert.equal(points.length, 700); // the route path would have been thinned to ~150
    assert.deepEqual(points[0], [22, 88]);
    assert.deepEqual(points[699], [22.699, 88]);
});

test('a record with no fix is a null placeholder, so later entries stay aligned with their records', async () => {
    const { getTrackPoints } = await load();
    const points = getTrackPoints([obdRecord(22, 88), obdRecord(undefined), obdRecord(22.1, 88)]);

    assert.deepEqual(points, [[22, 88], null, [22.1, 88]]);
});

test('with an ext map it reads ext GPS by the record\'s sync bucket; records without a match are null', async () => {
    const { getTrackPoints, getExtSyncTs } = await load();
    const rec = obdRecord(1, 1, '1786752004000');
    const bucket = getExtSyncTs(rec.time);
    const extMap = new Map([[bucket, { extGps: { lat: '12.5', lon: '77.5' } }]]);

    assert.deepEqual(getTrackPoints([rec], extMap), [[12.5, 77.5]]);
    assert.deepEqual(getTrackPoints([obdRecord(1, 1, '1786999999000')], extMap), [null]);
});
