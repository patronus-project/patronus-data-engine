var Websocket = require('ws');
var wserver;
var wsEnabled = process.env.WEBSOCKET_ENABLED !== 'false';
var broadCastMsg = function (msg, author, self) {
    if (!wsEnabled) return;
    //console.log(`in broadcast ${msg}`);
    wserver.clients.forEach(e => {
        if (Object.is(e, self)) {
            // console.log("in is loop");
            //continue;
        }
        else if (author) {
            var msgB = {};
            msgB.type = "BROADCAST"
            msgB.author = author
            msgB.payload = msg
            e.send(JSON.stringify(msgB));
        }
        else { e.send(msg); }
    });
}
exports.broadCastMsg=broadCastMsg;
exports.startWebSocketServer = function (server) {
    if (!wsEnabled) {
        console.log('WebSocket disabled (WEBSOCKET_ENABLED=false)');
        return;
    }
    var connections = {}
    wserver = new Websocket.Server({
        verifyClient: false,
        server: server,
        path: '/wsinit'
    });

    wserver.on('connection', function (wsocket) {
        if(typeof keepaliveInterval !== 'undefined') {
            startKeepAliveTimer();
        }
        broadCastMsg('we have a new member', 'OBDSERVER');
        wsocket.on('message', function (msg) {
            try {
                var payload = JSON.parse(msg);
                console.log(payload.msg);
            }
            catch (e) {
                console.log(e);
                wsocket.send(JSON.stringify({ err: "Incorrect json" }));
            }
        });
    });


    // wserver.on('request', function(request) {
    //     console.log(request);
    //     var connection = request.accept(null, request.origin);
    //     console.log(connection);
    //     connection.on('message', function(message) {
    //         console.log(message);
    //     });
    //     connection.on('close', function(connection) {
    //         // close user connection
    //         console.log("connection closed");
    //       });
    // });
}