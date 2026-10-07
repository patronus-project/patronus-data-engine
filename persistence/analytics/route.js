// The route as a thin polyline with speed on every point, plus where the trip stopped.

const { ROUTE_POINTS, STOP_WORTH_LISTING_MS } = require('./constants');
const { round } = require('./stats');

const buildRoute = (frames, breaks) => {
    const positioned = frames.filter((f) => f.lat !== null && f.lon !== null);
    if (positioned.length === 0) return { points: [], bounds: null, start: null, end: null, stops: [] };
    const step = Math.max(1, Math.ceil(positioned.length / ROUTE_POINTS));
    const kept = positioned.filter((_, i) => i % step === 0 || i === positioned.length - 1);
    const lats = kept.map((f) => f.lat);
    const lons = kept.map((f) => f.lon);
    return {
        // [lat, lon, km/h, km driven so far]
        points: kept.map((f) => [round(f.lat, 5), round(f.lon, 5), f.kmh === null ? null : round(f.kmh, 0), round(f.km, 1)]),
        bounds: { south: Math.min(...lats), north: Math.max(...lats), west: Math.min(...lons), east: Math.max(...lons) },
        start: { lat: positioned[0].lat, lon: positioned[0].lon, t: positioned[0].t },
        end: { lat: positioned[positioned.length - 1].lat, lon: positioned[positioned.length - 1].lon, t: positioned[positioned.length - 1].t },
        // Places the trip paused for 15 minutes or more
        stops: breaks
            .filter((b) => b.ms >= STOP_WORTH_LISTING_MS && b.lat !== null)
            .map((b) => ({ lat: round(b.lat, 5), lon: round(b.lon, 5), start: b.start, end: b.end, ms: b.ms, km: b.km, type: b.type }))
    };
};

module.exports = { buildRoute };
