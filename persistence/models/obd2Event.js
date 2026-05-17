const mongoose = require('mongoose');

const obd2EventSchema = new mongoose.Schema({
    email: { type: String, required: true, index: true },
    v: { type: String },
    session: { type: String, index: true },
    id: { type: String },
    time: { type: String },
    // Each KPI entry is dynamic, for example: { kff1005: "88.34" }.
    kpis: { type: [mongoose.Schema.Types.Mixed], default: [] },
    receivedAt: { type: Date, default: Date.now }
}, {
    minimize: false,
    versionKey: false
});

obd2EventSchema.index({ email: 1, session: 1 });

module.exports = mongoose.models.Obd2Event || mongoose.model('Obd2Event', obd2EventSchema);
