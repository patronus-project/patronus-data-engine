#!/usr/bin/env node
// TEMPORARY tool: define trips by hand, interactively.   node scripts/saved-trips.js
//
// A saved trip claims every OBD record inside its time range, so /api/trips shows it as one named trip and
// groups only the remaining records by silence. The tool asks for the range, counts the OBD records in it,
// asks you to confirm, and only then asks for the name, description and tags, one question at a time.
//
// Times are read in this machine's timezone ("2026-06-05 20:00"), or exactly as given with a "Z" / "+05:30".
// Reads MONGO_URI from .env like the server. Only the `savedtrips` collection is written; OBD data is only counted.

// ── Internal constants ──────────────────────────────────────────────────────

const HAS_ZONE = /(Z|[+-]\d{2}:?\d{2})$/i;
const TIME_HINT = 'YYYY-MM-DD HH:mm, your local time; a bare date is the whole day — or q to go back';

// ── Internal functions ──────────────────────────────────────────────────────

// Throws on text that isn't a date/time. A bare date means the start of that day, or the end of it for an end time.
const parseTime = (text, { endOfDay = false } = {}) => {
    const iso = String(text || '').trim().replace(' ', 'T');
    if (!iso) throw new Error('Please enter a date and time.');
    const bareDate = iso.length === 10;
    const date = new Date(HAS_ZONE.test(iso) ? iso : bareDate ? `${iso}T${endOfDay ? '23:59:59.999' : '00:00'}` : iso);
    if (isNaN(date)) throw new Error(`"${text.trim()}" isn't a date/time. Try 2026-06-05 20:00`);
    return date;
};

const fmt = (d) => `${d.toLocaleString()}  (${d.toISOString()})`;

const yesNo = async (io, question) => {
    for (;;) {
        const answer = (await io.ask(`${question} (y/n): `)).trim().toLowerCase();
        if (answer === 'y' || answer === 'yes') return true;
        if (answer === 'n' || answer === 'no') return false;
        io.print('  Please answer y or n.');
    }
};

// A time, re-asked until valid. Returns null when the person types q.
const askTime = async (io, label, options) => {
    for (;;) {
        const answer = await io.ask(`${label} (${TIME_HINT}): `);
        if (answer.trim().toLowerCase() === 'q') return null;
        try {
            return parseTime(answer, options);
        } catch (err) {
            io.print(`  ${err.message}`);
        }
    }
};

const askRequired = async (io, question) => {
    for (;;) {
        const answer = (await io.ask(question)).trim();
        if (answer) return answer;
        io.print('  This one is required.');
    }
};

// Steps 1–2: ask the range, show what it holds, get a yes. Returns { start, end } or null if the person backs out.
const chooseRange = async (io, store) => {
    for (;;) {
        io.print('\nStep 1 — when was the trip? (rough start and end are fine)');
        const start = await askTime(io, 'Start');
        if (!start) return null;
        const end = await askTime(io, 'End', { endOfDay: true });
        if (!end) return null;
        if (start >= end) {
            io.print('  The start must be before the end. Let\'s try again.');
            continue;
        }

        const clash = await store.findOverlapping(start, end);
        if (clash.length > 0) {
            io.print(`  That range overlaps saved trip(s): ${clash.map((c) => `"${c.name}"`).join(', ')}. Saved trips can't share records.`);
            continue;
        }

        const found = await store.recordsIn(start, end);
        if (found.count === 0) {
            io.print('  No OBD records fall inside that range — check the times (and that they are in your local timezone).');
            continue;
        }
        io.print(`\n  ${found.count} OBD records inside your range. The trip will snap to the actual data:\n    first  ${fmt(found.first)}\n    last   ${fmt(found.last)}`);
        if (await yesNo(io, '\nIs this the trip?')) return { start, end };
        io.print('  OK, let\'s re-enter the range.');
    }
};

const addTrip = async (io, store) => {
    const range = await chooseRange(io, store);
    if (!range) return io.print('Cancelled.');

    io.print('\nStep 2 — describe it');
    const name = await askRequired(io, 'Name: ');
    const description = (await io.ask('Description (Enter to skip): ')).trim();
    const tags = (await io.ask('Tags, comma separated (Enter to skip): ')).split(',').map((t) => t.trim()).filter(Boolean);

    const saved = await store.create({ name, description, tags, startTime: range.start, endTime: range.end });
    io.print(`\nSaved "${name}".  id=${saved._id}\nReplay link: /replay?trip=${saved._id}`);
};

const listTrips = async (io, store) => {
    const trips = await store.list();
    if (trips.length === 0) return io.print('\nNo saved trips.');
    io.print('');
    trips.forEach((t, i) => {
        io.print(`${i + 1}. ${t.name}${t.tags.length ? `  [${t.tags.join(', ')}]` : ''}`);
        io.print(`   ${t.startTime.toLocaleString()} → ${t.endTime.toLocaleString()}   id=${t._id}`);
        if (t.description) io.print(`   ${t.description}`);
    });
    return trips;
};

const removeTrip = async (io, store) => {
    const trips = await listTrips(io, store);
    if (!trips || trips.length === 0) return undefined;
    const answer = (await io.ask('\nNumber of the trip to remove (Enter to cancel): ')).trim();
    if (!answer) return io.print('Cancelled.');
    const trip = trips[Number(answer) - 1];
    if (!trip) return io.print(`  No trip number ${answer}.`);
    if (!(await yesNo(io, `Remove "${trip.name}"? Its records go back to automatic grouping.`))) return io.print('Cancelled.');
    await store.softDelete(trip._id);
    return io.print('Removed.');
};

const MENU = [
    ['Add a trip', addTrip],
    ['List saved trips', async (io, store) => { await listTrips(io, store); }],
    ['Remove a trip', removeTrip]
];

// ── Exported functions ──────────────────────────────────────────────────────

// The whole conversation. io = { ask(question) → Promise<string>, print(text) }; store = the database calls.
// Separate from the real prompt and database so it can be tested with scripted answers.
const runCli = async (io, store) => {
    io.print('Saved trips — define a trip by hand.');
    for (;;) {
        io.print('');
        MENU.forEach(([label], i) => io.print(`  ${i + 1}) ${label}`));
        io.print('  q) Quit');
        const choice = (await io.ask('Choose: ')).trim().toLowerCase();
        if (choice === 'q' || choice === 'quit') return;
        const item = MENU[Number(choice) - 1];
        if (item) await item[1](io, store);
        else io.print('  Please pick one of the options above.');
    }
};

// Database calls the conversation needs (the only place that touches Mongo)
const createMongoStore = () => {
    const SavedTrip = require('../persistence/models/savedTrip');
    const Obd2Event = require('../persistence/models/obd2Event');
    return {
        findOverlapping: (start, end) => SavedTrip.find({
            isDeleted: { $ne: true }, startTime: { $lte: end }, endTime: { $gte: start }
        }).lean().exec(),
        recordsIn: async (start, end) => {
            const where = { receivedAt: { $gte: start, $lte: end } };
            const [count, first, last] = await Promise.all([
                Obd2Event.countDocuments(where),
                Obd2Event.findOne(where, { receivedAt: 1 }).sort({ receivedAt: 1 }).lean().exec(),
                Obd2Event.findOne(where, { receivedAt: 1 }).sort({ receivedAt: -1 }).lean().exec()
            ]);
            return { count, first: first && first.receivedAt, last: last && last.receivedAt };
        },
        list: () => SavedTrip.find({ isDeleted: { $ne: true } }).sort({ startTime: 1 }).lean().exec(),
        create: (doc) => SavedTrip.create(doc),
        softDelete: (id) => SavedTrip.updateOne({ _id: id }, { $set: { isDeleted: true } })
    };
};

const main = async () => {
    require('dotenv').config();
    const readline = require('node:readline/promises');
    const mongoose = require('mongoose');
    const { connect } = require('../persistence/mongoose');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    let finished = false;
    // Ctrl+D / closed terminal mid-question would leave the prompt pending on an open DB connection: just leave
    rl.once('close', () => { if (!finished) { console.log('\nInput closed — nothing was saved.'); process.exit(1); } });
    try {
        await connect();
        await runCli({ ask: (q) => rl.question(q), print: (text) => console.log(text) }, createMongoStore());
    } finally {
        finished = true;
        rl.close();
        await mongoose.disconnect();
    }
};

if (require.main === module) {
    main().catch((err) => { console.error(`Error: ${err.message}`); process.exitCode = 1; });
}

module.exports = { runCli, parseTime };
