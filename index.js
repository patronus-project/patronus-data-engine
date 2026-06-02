require('dotenv').config();
var path = require('path');
var express = require('express');
var http = require('http');
var bodyParser = require('body-parser');
// var ssl = require('./security');
app = express();
var keymapper =  require('./data.json');
// var appSecure = https.createServer(ssl.getSSLOptions());
port = process.env.PORT;
// sslport = process.env.SSLPORT || 3443;
const wsocketserver= require('./websocketserver');
const obd2Persistence = require('./persistence/obd2Persistence');
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
            obd2Persistence.persistObd2Query(req.query, req.headers['user-agent']).catch(function (err) {
                console.log('obd2 persistence failed', err.message || err);
            });
            res.status(200);
            res.send('OK!');
        });
    // Paged detail for replay sliding window — must be before /api/obd2/history
    app.route('/api/obd2/history/paged')
        .get(function (req, res) {
            const { start, end, offset, limit } = req.query;
            obd2Persistence.findObd2EventsPaged({ start, end, offset, limit })
                .then(function (result) { res.status(200).json(result); })
                .catch(function (err) { res.status(500).json({ error: err.message }); });
        });

    app.route('/api/obd2/history')
        .get(function (req, res) {
            obd2Persistence.findObd2Events({ limit: 100 })
                .then(function (records) {
                    res.status(200).json(records);
                })
                .catch(function (err) {
                    console.log('history fetch failed', err.message || err);
                    res.status(500).json({ error: err.message });
                });
        });

    app.route('/api/trips')
        .get(function (req, res) {
            const { start, end } = req.query;
            const resolvedEnd   = end   || new Date().toISOString();
            const resolvedStart = start || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
            obd2Persistence.findTrips({ start: resolvedStart, end: resolvedEnd })
                .then(function (trips) { res.status(200).json(trips); })
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

wsocketserver.startWebSocketServer(server);

app.use(express.static(path.join(__dirname, 'public'), { etag: false, maxAge: '1y', immutable: true }));
app.get('*', function (req, res) {
    res.set('Cache-Control', 'no-store');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const { connect } = require('./persistence/mongoose');
connect()
    .then(function () { console.log('MongoDB connected OK'); })
    .catch(function (err) { console.error('MongoDB connection FAILED:', err.message); });



