const mongoose = require('mongoose');

// A trip someone defined by hand. Its time range claims the OBD records inside it, so /api/trips
// never auto-groups those records. Created and removed by scripts/saved-trips.js.
const savedTripSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    tags: { type: [String], default: [] },
    // Rough bounds: the trip is every OBD record whose receivedAt falls inside [startTime, endTime]
    startTime: { type: Date, required: true, index: true },
    endTime: { type: Date, required: true },
    isDeleted: { type: Boolean, default: false },
    // Computed from the trip's records by tripAnalyticsRunner; analyticsVersion says which version of the maths made it
    analytics: { type: mongoose.Schema.Types.Mixed, default: null },
    analyticsVersion: { type: Number, default: null },
    analyticsComputedAt: { type: Date, default: null }
}, {
    timestamps: true,
    versionKey: false
});

module.exports = mongoose.models.SavedTrip || mongoose.model('SavedTrip', savedTripSchema, 'savedtrips');
