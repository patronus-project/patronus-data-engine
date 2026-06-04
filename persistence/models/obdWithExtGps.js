// persistence/models/obdWithExtGps.js
const mongoose = require('mongoose');

const obdWithExtGpsSchema = new mongoose.Schema({
    sync_ts:        { type: Number, required: true, unique: true, index: true },
    email:          { type: String },
    v:              { type: String },
    session:        { type: String },
    id:             { type: String },
    time:           { type: String },
    kpis:           { type: [mongoose.Schema.Types.Mixed], default: [] },
    extGps:         { type: mongoose.Schema.Types.Mixed, default: null },
    obdReceivedAt:  { type: Date, default: null },
    gpsReceivedAt:  { type: Date, default: null }
}, {
    versionKey: false,
    minimize: false
});

module.exports = mongoose.models.ObdWithExtGps
    || mongoose.model('ObdWithExtGps', obdWithExtGpsSchema);