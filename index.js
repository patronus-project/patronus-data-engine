require('dotenv').config();
var path = require('path');
var express = require('express');
var http = require('http');
var bodyParser = require('body-parser');
const { ingestExternalGps } = require('./extGpsController');
const engineWatch = require('./engineWatch');
const { getTripAnalytics, ensureMissingTripAnalytics } = require('./persistence/tripAnalyticsRunner');
// var ssl = require('./security');
app = express();
var keymapper =  require('./data.json');
// var appSecure = https.createServer(ssl.getSSLOptions());
port = process.env.PORT;
// sslport = process.env.SSLPORT || 3443;
const wsocketserver= require('./websocketserver');
const { persistObd2Query, findObd2Events, findObd2EventsPaged, findTrips, findSavedTripById, findObdTimeline, findExtEvents, findExtEventsPaged } = require('./persistence/obd2Persistence');
console.log(`listening on port ${port}`);

var server = http.createServer(app).listen(port);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

function allowAll(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
}

    app.route('/api/keys')
        .get(allowAll, function(req,res){
            res.status(200)
            res.json(keymapper)
        })
    app.route('/api/obd2')
        .get(allowAll, function (req, res) {
            console.log(`broadcast at ${new Date()}`)
            const author = 'OBD'
            const msg = JSON.stringify(req.query);
            // console.log(req.headers)
            wsocketserver.broadCastMsg(msg,author)
            engineWatch.recordObdPing(req.query);
            persistObd2Query(req.query, req.headers['user-agent'])
                .then(engineWatch.recordObdResult)
                .catch(function (err) {
                    console.log('obd2 persistence failed', err.message || err);
                    engineWatch.recordObdError(err);
                });
            res.status(200);
            res.send('OK!');
        });
    // Liveness for the external monitor — process memory only, no database query
    app.route('/api/health')
        .get(engineWatch.getHealth);
    // Paged detail for replay sliding window — must be before /api/obd2/history
    app.route('/api/obd2/history/paged')
        .get(function (req, res) {
            const { start, end, offset, limit } = req.query;
            findObd2EventsPaged({ start, end, offset, limit })
                .then(function (result) { res.status(200).json(result); })
                .catch(function (err) { res.status(500).json({ error: err.message }); });
        });

    app.route('/api/obd2/history')
        .get(function (req, res) {
            findObd2Events({ limit: 100 })
                .then(function (records) { res.status(200).json(records); })
                .catch(function (err) { res.status(500).json({ error: err.message }); });
        });

    app.route('/api/trips')
        .get(function (req, res) {
            const { start, end } = req.query;
            const resolvedEnd   = end   || new Date().toISOString();
            const resolvedStart = start || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
            findTrips({ start: resolvedStart, end: resolvedEnd })
                .then(function (trips) { res.status(200).json(trips); })
                .catch(function (err) { res.status(500).json({ error: err.message }); });
        });

    // One hand-saved trip, so a shared replay link resolves without knowing the list's date range
    app.route('/api/trips/saved/:id')
        .get(function (req, res) {
            findSavedTripById(req.params.id)
                .then(function (trip) {
                    if (!trip) return res.status(404).json({ error: 'Saved trip not found' });
                    res.status(200).json(trip);
                })
                .catch(function (err) { res.status(500).json({ error: err.message }); });
        });

    // A saved trip's analytics (the Trip Summary). 202 while they are being computed: the page polls.
    app.route('/api/trips/saved/:id/analytics')
        .get(function (req, res) {
            getTripAnalytics(req.params.id)
                .then(function (result) {
                    if (!result) return res.status(404).json({ error: 'Saved trip not found' });
                    res.status(result.status === 'ready' ? 200 : 202).json(result);
                })
                .catch(function (err) { res.status(500).json({ error: err.message }); });
        });

    // Receive times (epoch ms) of every OBD record in a window — used to find the days of a multi-day trip
    app.route('/api/obd2/timeline')
        .get(function (req, res) {
            const { start, end } = req.query;
            if (!start || !end || isNaN(new Date(start)) || isNaN(new Date(end))) {
                return res.status(400).json({ error: 'start and end (ISO) are required' });
            }
            findObdTimeline({ start, end })
                .then(function (times) { res.status(200).json(times); })
                .catch(function (err) { res.status(500).json({ error: err.message }); });
        });

    app.route('/api/obd2/ext-history/paged')
        .get(function (req, res) {
            const { start, end, offset, limit } = req.query;
            findExtEventsPaged({ start, end, offset, limit })
                .then(function (result) { res.status(200).json(result); })
                .catch(function (err) { res.status(500).json({ error: err.message }); });
        });

    app.route('/api/obd2/ext-history')
        .get(function (req, res) {
            findExtEvents({ limit: 100 })
                .then(function (records) { res.status(200).json(records); })
                .catch(function (err) { res.status(500).json({ error: err.message }); });
        });
    app.route('/api/obd2sim')
        .get(allowAll, function (req, res) {
            console.log(`simbroadcast at ${new Date()}`)
            const author = 'OBD'
            const msq = {sim: true, ...req.query}
            const msg = JSON.stringify(msq);
            wsocketserver.broadCastMsg(msg,author)
            res.status(200);
            res.send('OK!');
        });
    app.route('/api/telemetry/gps-event')
    .post(allowAll, engineWatch.observeGps, ingestExternalGps);

wsocketserver.startWebSocketServer(server);

// Stopgap: this also serves index.html for '/', so a long max-age strands old builds (blank page after deploy).
// 6h caps that window; the proper fix is index: false + no-store for index.html / sw.js / manifest (docs/03 rule 15).
app.use(express.static(path.join(__dirname, 'public'), { etag: false, maxAge: '6h' }));
app.get('*', function (req, res) {
    res.set('Cache-Control', 'no-store');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

engineWatch.start();

const { connect } = require('./persistence/mongoose');
connect()
    .then(function () {
        console.log('MongoDB connected OK');
        // Any saved trip without current analytics gets them computed, in the background; nothing waits on this
        ensureMissingTripAnalytics()
            .then(function (n) { if (n) console.log('trip analytics computed for', n, 'saved trip(s)'); })
            .catch(function (err) { console.error('trip analytics sweep failed:', err.message || err); });
    })
    .catch(function (err) {
        console.error('MongoDB connection FAILED:', err.message);
        engineWatch.recordMongoConnectFailure(err);
    });



