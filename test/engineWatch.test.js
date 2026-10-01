const test = require('node:test');
const assert = require('node:assert/strict');

const watch = require('../engineWatch');

const { evaluate, recordGpsResult, getState, setClock, setSink, reset } = watch.__test;

const MIN = 60 * 1000;
let now;
let sent;

const at = (ms) => { now = ms; };
const titles = () => sent.map((n) => n.title);
const obd = (kd) => watch.recordObdPing({ kd: String(kd) });
const gps = (lat, lon, spdMs) => recordGpsResult(200, { lat: String(lat), lon: String(lon), spd: String(spdMs) });

test.beforeEach(() => {
    now = 1_786_768_200_000;
    sent = [];
    setClock(() => now);
    setSink((n) => sent.push(n));
    reset();
});

test('a GPS-only drive starts, goes dark mid-drive, recovers, and ends with a summary', () => {
    gps(17.5, 78.2, 15);                 // 54 km/h → drive starts
    assert.deepEqual(titles(), ['Drive started']);

    at(now + 6 * MIN);                   // nothing for 6 minutes
    evaluate();
    assert.equal(sent.at(-1).title, 'No data mid-drive');
    assert.equal(sent.at(-1).priority, 'high');

    gps(17.51, 78.21, 15);               // data back
    evaluate();
    assert.equal(sent.at(-1).title, 'Resolved: No data mid-drive');

    for (let i = 1; i <= 16; i++) {      // parked: pings keep coming at 0 km/h for 16 min
        at(now + MIN);
        gps(17.52, 78.22, 0);
    }
    evaluate();
    assert.equal(sent.at(-1).title, 'Drive summary');
    assert.match(sent.at(-1).message, /ended: stationary for 15 min/);
    assert.equal(getState().drive, null);
});

test('OBD silence while GPS keeps arriving alerts once, only if OBD was part of this drive', () => {
    obd(60);
    gps(17.5, 78.2, 16);
    for (let i = 1; i <= 6; i++) {       // OBD stops; GPS keeps pinging every minute
        at(now + MIN);
        gps(17.5 + i / 100, 78.2, 16);
    }
    evaluate();
    evaluate();                          // second run must not re-alert
    assert.equal(titles().filter((t) => t === 'OBD stopped mid-drive').length, 1);
    assert.ok(!titles().includes('No data mid-drive'));
});

test('a GPS-only drive never raises "OBD stopped" (OBD is rarely connected)', () => {
    gps(17.5, 78.2, 16);
    for (let i = 1; i <= 10; i++) {
        at(now + MIN);
        gps(17.5 + i / 100, 78.2, 16);
    }
    evaluate();
    assert.ok(!titles().includes('OBD stopped mid-drive'));
});

test('identical ext GPS fixes while OBD says moving raise "Ext GPS frozen", then resolve', () => {
    for (let i = 0; i < 8; i++) {
        at(now + 10_000);
        obd(55);
        gps(17.6, 78.1, 0);              // same fix every time
    }
    evaluate();
    assert.ok(titles().includes('Ext GPS frozen'));

    at(now + 10_000);
    obd(55);
    gps(17.61, 78.11, 15);
    evaluate();
    assert.ok(titles().includes('Resolved: Ext GPS frozen'));
});

test('skipped OBD pings alert once per cooldown and count the repeats', () => {
    for (let i = 0; i < 5; i++) watch.recordObdResult({ skipped: true, reason: 'user-agent-not-allowed' });
    assert.equal(titles().filter((t) => t === 'OBD ping not saved').length, 1);

    at(now + 31 * MIN);
    watch.recordObdResult({ skipped: true, reason: 'user-agent-not-allowed' });
    assert.equal(titles().filter((t) => t === 'OBD ping not saved').length, 2);
    assert.match(sent.at(-1).message, /\+4 more/);
    assert.deepEqual(getState().obd.skipped, { 'user-agent-not-allowed': 6 });
});

test('rejected GPS payloads are counted and never update the last GPS ping', () => {
    recordGpsResult(400, { lat: 'north' });
    assert.equal(getState().gps.rejected, 1);
    assert.equal(getState().gps.lastPingAt, null);
    assert.equal(sent.at(-1).title, 'GPS ping rejected');
});

test('no notification ever contains coordinates or an email', () => {
    obd(60);
    gps(17.123456, 78.654321, 15);
    for (let i = 0; i < 8; i++) { at(now + 10_000); obd(60); gps(17.123456, 78.654321, 0); }
    at(now + 6 * MIN);
    evaluate();
    watch.recordObdResult({ skipped: true, reason: 'missing-required-fields' });
    const all = sent.map((n) => `${n.title} ${n.message}`).join('\n');
    assert.doesNotMatch(all, /17\.12|78\.65|@/);
});

test('health reports liveness from memory without touching the database', () => {
    obd(42);
    let status;
    let json;
    const res = {
        set: () => res,
        status: (s) => { status = s; return res; },
        json: (b) => { json = b; return res; },
    };
    watch.getHealth({}, res);
    assert.equal(status, 200);
    assert.equal(json.ingest.obd.lastSpeedKmh, 42);
    assert.equal(json.mongo, 'disconnected');   // no connection in tests
    assert.equal(json.status, 'degraded');
    assert.ok(!('db' in json));
});
