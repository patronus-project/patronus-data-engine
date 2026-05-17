const mongoose = require('mongoose');

let connectPromise = null;

function connect() {
    if (connectPromise) {
        return connectPromise;
    }

    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
        return Promise.reject(new Error('MONGO_URI is not set'));
    }

    connectPromise = mongoose.connect(mongoUri, {
        dbName: process.env.MONGO_DB_NAME || 'patronus_research'
    }).then(function () {
        return mongoose;
    });

    connectPromise.catch(function () {
        connectPromise = null;
    });

    return connectPromise;
}

module.exports = {
    connect: connect
};
