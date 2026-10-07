const test = require('node:test');
const assert = require('node:assert/strict');

const HOUR = 60 * 60 * 1000;
const MIN = 60 * 1000;
// Local-time constructor so the "crosses local midnight" rule is tested in whatever zone the tests run in
const local = (d, h, m = 0) => new Date(2026, 5, d, h, m).getTime();

const load = () => import('../frontend/src/components/tripDays.js');

// Pings every 10 min on day 1 (08:00-16:00), a 19 h overnight stop, then day 2 from 11:00 to 14:00
const twoDayTrip = () => {
    const ts = [];
    for (let m = 0; m <= 8 * 60; m += 10) ts.push(local(5, 8) + m * MIN);
    for (let m = 0; m <= 3 * 60; m += 10) ts.push(local(6, 11) + m * MIN);
    return ts;
};

test('a trip with no long overnight break is a single day', async () => {
    const { splitIntoDays, dayInfoAt } = await load();
    const ts = [local(5, 8), local(5, 9), local(5, 15), local(5, 16)]; // a 6 h lunch gap, same date

    assert.equal(splitIntoDays(ts).length, 1);
    assert.deepEqual(dayInfoAt(splitIntoDays(ts), local(5, 15)), { index: 1, total: 1 });
});

test('a 4 h+ break across local midnight starts a new day', async () => {
    const { splitIntoDays } = await load();
    const days = splitIntoDays([local(5, 8), local(5, 20), local(6, 7), local(6, 12), local(7, 6)]);

    assert.equal(days.length, 3);
    assert.equal(days[1].start, local(6, 7));
    assert.equal(days[1].end, local(6, 12));
});

test('a night drive that never pauses stays one day even across midnight', async () => {
    const { splitIntoDays } = await load();
    const ts = [local(5, 23), local(5, 23, 30), local(6, 0, 10), local(6, 1)];

    assert.equal(splitIntoDays(ts).length, 1);
});

test('dayInfoAt reports which day a moment is on', async () => {
    const { splitIntoDays, dayInfoAt } = await load();
    const days = splitIntoDays([local(5, 8), local(5, 20), local(6, 7), local(6, 12)]);

    assert.deepEqual(dayInfoAt(days, local(5, 9)), { index: 1, total: 2 });
    assert.deepEqual(dayInfoAt(days, local(6, 11)), { index: 2, total: 2 });
});

test('empty or missing timestamps give no days', async () => {
    const { splitIntoDays, dayInfoAt } = await load();

    assert.deepEqual(splitIntoDays([]), []);
    assert.deepEqual(splitIntoDays(null), []);
    assert.equal(dayInfoAt([], 1), null);
});

test('trip time carries on across days: the first hour of day 2 is day 1\'s total plus one hour', async () => {
    const { frameClocks } = await load();
    const ts = twoDayTrip();
    const { tripTimeMs } = frameClocks(ts);
    const at = (t) => tripTimeMs[ts.indexOf(t)];

    assert.equal(tripTimeMs[0], 0);
    assert.equal(at(local(5, 16)), 8 * HOUR);   // end of day 1
    assert.equal(at(local(6, 11)), 8 * HOUR);   // first ping of day 2: the 19 h stop adds nothing
    assert.equal(at(local(6, 12)), 9 * HOUR);   // one hour into day 2
    // wall-clock since the start would have said 28 h at that point
    assert.ok(local(6, 12) - ts[0] > 27 * HOUR);
});

test('pauses shorter than a long break (a 2 h lunch) still count as trip time', async () => {
    const { frameClocks } = await load();
    const { tripTimeMs } = frameClocks([local(5, 8), local(5, 9), local(5, 11), local(5, 12)]);

    assert.equal(tripTimeMs[3], 4 * HOUR);
});

test('a gap of exactly 4 h is a long break and is left out', async () => {
    const { frameClocks } = await load();

    assert.equal(frameClocks([local(5, 8), local(5, 12)]).tripTimeMs[1], 0);
    assert.equal(frameClocks([local(5, 8), local(5, 11, 59)]).tripTimeMs[1], 3 * HOUR + 59 * MIN);
});

test('last break is the most recent pause of 30 min or more', async () => {
    const { frameClocks } = await load();
    const ts = twoDayTrip();
    const { lastBreakMs } = frameClocks(ts);
    const at = (t) => lastBreakMs[ts.indexOf(t)];

    assert.equal(lastBreakMs[0], null);          // nothing yet
    assert.equal(lastBreakMs[10], null);         // ten-minute pings are not breaks
    assert.equal(at(local(5, 16)), null);        // not reached yet on day 1
    assert.equal(at(local(6, 11)), 19 * HOUR);   // the overnight stop
    assert.equal(at(local(6, 12)), 19 * HOUR);   // still the latest an hour later
});

test('a 30 minute pause is a break; 29 minutes is not', async () => {
    const { frameClocks } = await load();

    assert.equal(frameClocks([local(5, 8), local(5, 8, 30)]).lastBreakMs[1], 30 * MIN);
    assert.equal(frameClocks([local(5, 8), local(5, 8, 29)]).lastBreakMs[1], null);
});

test('a later break replaces an earlier one', async () => {
    const { frameClocks } = await load();
    const ts = [local(5, 8), local(5, 9), local(5, 10), local(5, 10, 45)];
    const { lastBreakMs } = frameClocks(ts);

    assert.equal(lastBreakMs[1], 1 * HOUR);
    assert.equal(lastBreakMs[3], 45 * MIN);
});

test('frameClocks tolerates missing timestamps', async () => {
    const { frameClocks } = await load();

    assert.deepEqual(frameClocks(null), { tripTimeMs: [], lastBreakMs: [] });
});
