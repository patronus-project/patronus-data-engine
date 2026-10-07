const test = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../frontend/src/hooks/replayLoader.js');
const T0 = Date.UTC(2026, 5, 5, 0, 0, 0);
const SOURCE = { start: '2026-06-05T00:00:00Z', end: '2026-06-06T00:00:00Z' };

// ── A fake server ───────────────────────────────────────────────────────────
// OBD record i arrives at T0 + 5 s * i. Every second record has an ext GPS fix (as in real trips).
// held: offsets whose response waits until release(); failing: offsets/ext pages that reject.
const makeServer = ({ total = 2000, extTotal = Math.ceil(total / 2) } = {}) => {
    const calls = [];
    const held = new Map();
    const failing = { obd: new Map(), ext: new Map() };
    let pending = 0;
    let maxPending = 0;

    const record = (i) => ({ receivedAt: new Date(T0 + i * 5000).toISOString(), time: String(T0 + i * 5000), kpis: [{ kd: '60' }] });
    const extDoc = (n) => ({ sync_ts: T0 + n * 10000, obdReceivedAt: new Date(T0 + n * 10000).toISOString(), extGps: { lat: 22, lon: 88 } });

    const fetchJson = (url) => new Promise((resolve, reject) => {
        const u = new URL(url, 'http://x');
        const offset = Number(u.searchParams.get('offset'));
        const limit = Number(u.searchParams.get('limit'));
        const kind = u.pathname.includes('ext-history') ? 'ext' : 'obd';
        calls.push({ kind, offset, limit });
        const respond = () => {
            const left = failing[kind].get(offset) || 0;
            if (left > 0) { failing[kind].set(offset, left - 1); pending -= 1; return reject(new Error('boom')); }
            const all = kind === 'obd' ? total : extTotal;
            const records = Array.from({ length: Math.max(0, Math.min(limit, all - offset)) }, (_, i) => (kind === 'obd' ? record(offset + i) : extDoc(offset + i)));
            pending -= 1;
            resolve({ records, total: all, offset, limit });
        };
        pending += 1;
        maxPending = Math.max(maxPending, pending);
        if (kind === 'obd' && held.has(offset)) held.get(offset).push(respond);
        else queueMicrotask(respond);
    });

    return {
        fetchJson, calls,
        maxPending: () => maxPending,
        hold: (offset) => held.set(offset, []),
        release: (offset) => { (held.get(offset) || []).forEach((f) => f()); held.delete(offset); },
        failObd: (offset, times) => failing.obd.set(offset, times),
        failExt: (offset, times) => failing.ext.set(offset, times),
        obdOffsets: () => calls.filter((c) => c.kind === 'obd').map((c) => c.offset),
        extOffsets: () => calls.filter((c) => c.kind === 'ext').map((c) => c.offset),
    };
};

const settle = () => new Promise((resolve) => setImmediate(resolve));

const setup = async (serverOptions, { timers } = {}) => {
    const { createReplayLoader } = await load();
    const server = makeServer(serverOptions);
    const chunks = [];
    const exts = [];
    const state = { total: null };
    const loader = createReplayLoader({
        fetchJson: server.fetchJson,
        onTotal: (n) => { state.total = n; },
        onRecords: (chunk) => chunks.push(chunk),
        onExt: (extState, docs) => exts.push({ extState, docs }),
        setTimer: timers ? (fn, ms) => timers.push({ fn, ms }) : setTimeout,
    });
    return { loader, server, chunks, exts, state };
};

// ── Tests ───────────────────────────────────────────────────────────────────

test('it starts with one page, learns the total, and loads no more than the lookahead needs', async () => {
    const { loader, server, state } = await setup();
    loader.reset(SOURCE);
    await settle();

    assert.equal(state.total, 2000);
    assert.deepEqual(server.obdOffsets(), [0]);                  // 100 frames of lookahead fit inside the first 250
    assert.equal(loader.loadedCount(), 250);
});

test('a higher speed pulls a bigger lookahead: 20x wants ~667 frames, so three pages are loaded', async () => {
    const { loader, server } = await setup();
    loader.reset(SOURCE);
    await settle();
    loader.setPlayhead(0, 20);
    await settle();

    assert.deepEqual(server.obdOffsets(), [0, 250, 500]);
    assert.equal(loader.loadedCount(), 750);
});

test('the buffer rolls: as the playhead moves, the next pages are fetched ahead of need, not at the end', async () => {
    const { loader, server } = await setup();
    loader.reset(SOURCE);
    await settle();
    loader.setPlayhead(0, 20);
    await settle();
    assert.equal(loader.loadedCount(), 750);

    loader.setPlayhead(300, 20);          // 450 frames still loaded ahead, but the 667 target is not met
    await settle();

    assert.ok(server.obdOffsets().includes(750));
    assert.ok(loader.loadedCount() >= 300 + 668);
});

test('never more than three OBD requests at once, however far the playhead jumps', async () => {
    const { loader, server } = await setup({ total: 8000 });
    loader.reset(SOURCE);
    await settle();
    [250, 500, 750, 1000].forEach((o) => server.hold(o));
    loader.setPlayhead(3000, 20);          // wants everything up to ~3700
    await settle();

    assert.deepEqual(server.obdOffsets(), [0, 250, 500, 750]);          // the parallel limit, in order
    assert.equal(server.maxPending(), 3);
    server.release(250);
    await settle();
    assert.ok(server.obdOffsets().includes(1000), 'a finished request frees a slot straight away');
});

test('pages that arrive out of order are only released once they continue the list', async () => {
    const { loader, server, chunks } = await setup();
    loader.reset(SOURCE);
    await settle();
    server.hold(250);
    loader.setPlayhead(0, 20);
    await settle();

    assert.equal(loader.loadedCount(), 250);                       // page 500 arrived but cannot be shown before 250
    assert.equal(chunks.length, 1);
    server.release(250);
    await settle();

    assert.equal(loader.loadedCount(), 750);
    assert.equal(chunks[1].length, 500);                           // 250 and 500 released together, in order
    assert.equal(loader.recordAt(260).receivedAt, new Date(T0 + 260 * 5000).toISOString());
});

test('ext GPS is loaded until it covers the lookahead, and a record is only "covered" once it has', async () => {
    const { loader, server } = await setup();
    loader.reset(SOURCE);
    assert.equal(loader.extCoversRecord(10), false);               // nothing loaded yet
    await settle();

    assert.deepEqual(server.extOffsets(), [0]);
    assert.equal(loader.extCoversRecord(10), true);
    assert.equal(loader.extCoversRecord(200), true);               // the last loaded OBD record (249) is inside what 500 ext docs span (~998)
    assert.equal(loader.extCoversRecord(900), false);              // not loaded yet, so not "covered"
});

test('ext GPS keeps pace with a moving playhead and stops asking once it has everything', async () => {
    const { loader, server } = await setup({ total: 2000, extTotal: 1000 });
    loader.reset(SOURCE);
    await settle();
    loader.setPlayhead(900, 20);
    await settle();

    assert.deepEqual(server.extOffsets(), [0, 500]);
    assert.equal(loader.ext().done, true);
    assert.equal(loader.extCoversRecord(1999), loader.loadedCount() > 1999);
    const before = server.extOffsets().length;
    loader.setPlayhead(1000, 20);
    await settle();
    assert.equal(server.extOffsets().length, before);
});

test('a failed page is retried after a delay and the list still completes', async () => {
    const timers = [];
    const { loader, server } = await setup({}, { timers });
    server.failObd(250, 1);
    loader.reset(SOURCE);
    await settle();
    loader.setPlayhead(0, 20);
    await settle();

    assert.equal(loader.loadedCount(), 250 + 0);                    // 250 failed; 500 arrived but waits behind it
    assert.ok(timers.some((t) => t.ms === 1500), 'a retry was scheduled');
    timers.splice(0).forEach((t) => t.fn());
    await settle();

    assert.equal(loader.loadedCount(), 750);
    assert.equal(server.obdOffsets().filter((o) => o === 250).length, 2);
});

test('after three ext failures in a row it gives up and stops holding playback back', async () => {
    const timers = [];
    const { loader, server } = await setup({}, { timers });
    server.failExt(0, 99);
    loader.reset(SOURCE);
    await settle();
    for (let i = 0; i < 3; i++) { timers.splice(0).forEach((t) => t.fn()); await settle(); }

    assert.equal(loader.ext().done, true);
    assert.equal(loader.extCoversRecord(100), true);
});

test('responses for a source that has been replaced are ignored', async () => {
    const { loader, server, chunks } = await setup();
    server.hold(0);
    loader.reset(SOURCE);
    await settle();
    loader.reset({ start: '2026-07-01T00:00:00Z', end: '2026-07-02T00:00:00Z' });   // a different trip picked meanwhile
    server.release(0);
    await settle();

    assert.equal(chunks.length, 1, 'only the new source loaded');
    assert.equal(loader.loadedCount(), 250);
});

test('with no source it does nothing', async () => {
    const { loader, server } = await setup();
    loader.reset(null);
    loader.setPlayhead(10, 20);
    await settle();

    assert.equal(server.calls.length, 0);
});
