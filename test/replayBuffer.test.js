const test = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../frontend/src/hooks/replayBuffer.js');

test('lookahead grows with speed: about 20 s of playback, never under 100 frames', async () => {
    const { lookaheadFrames } = await load();

    assert.equal(lookaheadFrames(1), 100);                 // 33 frames of playback, floored at 100
    assert.equal(lookaheadFrames(2), 100);
    assert.equal(lookaheadFrames(5), 167);
    assert.equal(lookaheadFrames(10), 334);
    assert.equal(lookaheadFrames(20), 667);
    assert.ok(lookaheadFrames(20) >= 4 * lookaheadFrames(5) * 0.99);
});

test('records wanted = playhead + lookahead, capped at the trip length once that is known', async () => {
    const { framesWanted, lookaheadFrames } = await load();

    assert.equal(framesWanted(0, 20, null), 1 + lookaheadFrames(20));
    assert.equal(framesWanted(1000, 10, 8000), 1001 + lookaheadFrames(10));
    assert.equal(framesWanted(7900, 20, 8000), 8000);
});

test('before the total is known only the first page is requested, and only once', async () => {
    const { planRequests, CHUNK } = await load();

    assert.deepEqual(planRequests({ requested: 0, inFlight: 0, total: null, wanted: 700 }), { offsets: [0], nextRequested: CHUNK });
    assert.deepEqual(planRequests({ requested: CHUNK, inFlight: 1, total: null, wanted: 700 }), { offsets: [], nextRequested: CHUNK });
});

test('once the total is known, pages fan out up to the parallel limit and stop at what is wanted', async () => {
    const { planRequests, CHUNK, MAX_PARALLEL } = await load();
    const plan = planRequests({ requested: CHUNK, inFlight: 0, total: 8000, wanted: 5000 });

    assert.equal(plan.offsets.length, MAX_PARALLEL);
    assert.deepEqual(plan.offsets, [CHUNK, 2 * CHUNK, 3 * CHUNK]);
    assert.equal(plan.nextRequested, 4 * CHUNK);

    const near = planRequests({ requested: 4 * CHUNK, inFlight: 0, total: 8000, wanted: 1100 });
    assert.deepEqual(near.offsets, [4 * CHUNK]);                                      // wanted ends inside the next page
    assert.deepEqual(planRequests({ requested: 5 * CHUNK, inFlight: 0, total: 8000, wanted: 1100 }).offsets, []);
});

test('requests already in flight count against the parallel limit', async () => {
    const { planRequests, CHUNK, MAX_PARALLEL } = await load();

    assert.equal(planRequests({ requested: CHUNK, inFlight: MAX_PARALLEL, total: 8000, wanted: 8000 }).offsets.length, 0);
    assert.equal(planRequests({ requested: CHUNK, inFlight: MAX_PARALLEL - 1, total: 8000, wanted: 8000 }).offsets.length, 1);
});

test('never requests past the end of the trip', async () => {
    const { planRequests, CHUNK } = await load();
    const plan = planRequests({ requested: 7750, inFlight: 0, total: 8000, wanted: 99999 });

    assert.deepEqual(plan.offsets, [7750]);
    assert.equal(plan.nextRequested, 7750 + CHUNK);
    assert.deepEqual(planRequests({ requested: 8000, inFlight: 0, total: 8000, wanted: 99999 }).offsets, []);
});

test('failed pages are asked for again before new ones, and still respect the limit', async () => {
    const { planRequests, CHUNK, MAX_PARALLEL } = await load();
    const plan = planRequests({ requested: 4 * CHUNK, inFlight: MAX_PARALLEL - 2, total: 8000, wanted: 8000, retry: [CHUNK] });

    assert.equal(plan.offsets[0], CHUNK);
    assert.equal(plan.offsets.length, 2);
    assert.deepEqual(planRequests({ requested: CHUNK, inFlight: 0, total: null, wanted: 700, retry: [0] }).offsets, [0]);
});

test('pages arriving out of order are only released once they continue the list without a hole', async () => {
    const { takeContiguous } = await load();
    const pages = new Map([[250, ['c', 'd']], [500, ['e']]]);

    assert.deepEqual(takeContiguous(pages, 0), { records: [], length: 0 });          // page 0 hasn't arrived: nothing yet
    pages.set(0, new Array(250).fill('x'));
    const out = takeContiguous(pages, 0);

    assert.equal(out.records.length, 250 + 2);                                        // page 0 and the page at 250
    assert.equal(out.length, 252);
    assert.equal(pages.size, 1);                                                      // offset 500 does not continue from 252
    assert.deepEqual([...pages.keys()], [500]);
});

test('an empty page ends the list instead of looping', async () => {
    const { takeContiguous } = await load();

    assert.deepEqual(takeContiguous(new Map([[0, []]]), 0), { records: [], length: 0 });
});

test('ext GPS covers a record when it is done, or has loaded past that moment', async () => {
    const { extCovers } = await load();

    assert.equal(extCovers({ done: true, coveredMs: 0 }, 5000), true);
    assert.equal(extCovers({ done: false, coveredMs: 6000 }, 5000), true);
    assert.equal(extCovers({ done: false, coveredMs: 4000 }, 5000), false);
});

test('the buffer is ready when enough records are loaded and ext GPS has caught up to them', async () => {
    const { bufferReady } = await load();
    const records = Array.from({ length: 300 }, (_, i) => ({ receivedAt: new Date(1000 * i).toISOString() }));
    const base = { total: 1000, records, loaded: 300, ext: { done: false, coveredMs: 1e9 } };

    assert.equal(bufferReady({ ...base, waitFor: null }), true);
    assert.equal(bufferReady({ ...base, waitFor: { frames: 200 } }), true);
    assert.equal(bufferReady({ ...base, waitFor: { frames: 400 } }), false);                          // not enough records yet
    assert.equal(bufferReady({ ...base, waitFor: { frames: 200 }, ext: { done: false, coveredMs: 100 } }), false);   // ext behind
    assert.equal(bufferReady({ ...base, waitFor: { frames: 5000 }, total: 300 }), true);               // asks for more than exists: all loaded is enough
});
