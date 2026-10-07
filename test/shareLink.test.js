const test = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../frontend/src/components/shareLink.js');
const loc = (pathname, search = '') => ({ pathname, search });
const ID = 'a1b2c3d4e5f60718293a4b5c';

test('a saved trip links by id, any other trip by its exact time range', async () => {
    const { buildReplayPath } = await load();

    assert.equal(buildReplayPath({ savedTripId: ID, startTime: 'x', endTime: 'y' }), `/replay?trip=${ID}`);
    assert.equal(
        buildReplayPath({ startTime: '2026-06-05T08:16:08.000Z', endTime: '2026-06-08T04:07:56.000Z' }),
        '/replay?start=2026-06-05T08%3A16%3A08.000Z&end=2026-06-08T04%3A07%3A56.000Z'
    );
});

test('links parse back to the same trip', async () => {
    const { buildReplayPath, parseReplayLink } = await load();
    const range = { startTime: '2026-06-05T08:16:08.000Z', endTime: '2026-06-08T04:07:56.000Z' };
    const [path, search] = buildReplayPath(range).split('?');

    assert.deepEqual(parseReplayLink(loc(path, `?${search}`)), { start: range.startTime, end: range.endTime });
    assert.deepEqual(parseReplayLink(loc('/replay', `?trip=${ID}`)), { trip: ID });
});

test('anything that is not a valid replay link is ignored', async () => {
    const { parseReplayLink } = await load();

    assert.equal(parseReplayLink(loc('/')), null);
    assert.equal(parseReplayLink(loc('/replay')), null);
    assert.equal(parseReplayLink(loc('/replay', '?trip=not-an-id')), null);
    assert.equal(parseReplayLink(loc('/replay', '?start=2026-06-08T00:00:00Z&end=2026-06-05T00:00:00Z')), null);
    assert.equal(parseReplayLink(loc('/replay', '?start=garbage&end=garbage')), null);
});

test('tripKey is the saved id, or the time range', async () => {
    const { tripKey } = await load();

    assert.equal(tripKey({ savedTripId: ID, startTime: 'a', endTime: 'b' }), ID);
    assert.equal(tripKey({ startTime: 'a', endTime: 'b' }), 'a|b');
});
