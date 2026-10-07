const test = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../frontend/src/components/tripProgress.js');
const SEC = 1000;
const MIN = 60 * SEC;
const T0 = Date.UTC(2026, 5, 5, 0, 0, 0);
const times = (n, stepMs) => Array.from({ length: n }, (_, i) => T0 + i * stepMs);

test('a steady 60 km/h for 10 minutes is 10 km', async () => {
    const { cumulativeKmFromSpeed } = await load();
    const km = cumulativeKmFromSpeed(new Array(11).fill(60), times(11, 1 * MIN)); // 10 one-minute steps

    assert.equal(km[0], 0);
    assert.ok(Math.abs(km[10] - 10) < 1e-9);
});

test('speed is averaged across each step: ramping 0 to 60 km/h over a minute averages 30 km/h, so 0.5 km', async () => {
    const { cumulativeKmFromSpeed } = await load();
    const km = cumulativeKmFromSpeed([0, 15, 30, 45, 60], times(5, 15 * SEC));

    assert.ok(Math.abs(km[4] - 0.5) < 1e-9);
});

test('the total never decreases', async () => {
    const { cumulativeKmFromSpeed } = await load();
    const km = cumulativeKmFromSpeed([50, 0, 80, 20, 0, 60], times(6, 5 * SEC));

    km.slice(1).forEach((v, i) => assert.ok(v >= km[i]));
});

test('a break (gap over 60 s) adds no distance, so an overnight stop is not counted as driving', async () => {
    const { cumulativeKmFromSpeed } = await load();
    const ts = [T0, T0 + 5 * SEC, T0 + 10 * 60 * 60 * 1000, T0 + 10 * 60 * 60 * 1000 + 5 * SEC];
    const km = cumulativeKmFromSpeed([60, 60, 60, 60], ts);

    const twoSteps = (60 * 5) / 3600; // 5 s at 60 km/h, twice
    assert.ok(Math.abs(km[3] - 2 * twoSteps) < 1e-9);
    assert.equal(km[2], km[1]); // the 10 h gap contributed nothing
});

test('records with no speed carry the total forward and do not break the sum', async () => {
    const { cumulativeKmFromSpeed } = await load();
    const km = cumulativeKmFromSpeed([60, null, 60], times(3, 10 * SEC));

    assert.equal(km[1], km[0]);
    assert.ok(Math.abs(km[2] - (60 * 20) / 3600) < 1e-9); // the null record is bridged by the 20 s between its neighbours
});

test('records at the same instant, or non-numeric speeds, add nothing', async () => {
    const { cumulativeKmFromSpeed } = await load();

    assert.equal(cumulativeKmFromSpeed([60, 60], [T0, T0])[1], 0);
    assert.equal(cumulativeKmFromSpeed([60, NaN, undefined], times(3, 5 * SEC))[2], 0);
});

test('tripPercent is trip time done over total trip time, clamped to 0-100', async () => {
    const { tripPercent } = await load();

    assert.equal(tripPercent(50 * MIN, 100 * MIN), 50);
    assert.equal(tripPercent(0, 100 * MIN), 0);
    assert.equal(tripPercent(-MIN, 100 * MIN), 0);
    assert.equal(tripPercent(200 * MIN, 100 * MIN), 100);
    assert.equal(tripPercent(null, 100 * MIN), null);
    assert.equal(tripPercent(10 * MIN, 0), null);
    assert.equal(tripPercent(10 * MIN, null), null);
});
