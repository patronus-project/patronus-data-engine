// Small numeric helpers shared by the analytics modules (no database, no dates beyond epoch ms).

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

const median = (xs) => {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const maxOf = (xs) => (xs.length ? xs.reduce((a, b) => (b > a ? b : a), xs[0]) : null);
const minOf = (xs) => (xs.length ? xs.reduce((a, b) => (b < a ? b : a), xs[0]) : null);

const round = (n, digits = 0) => (n === null || n === undefined || !Number.isFinite(n) ? null : Math.round(n * 10 ** digits) / 10 ** digits);

const EARTH_RADIUS_KM = 6371;
const toRad = (deg) => (deg * Math.PI) / 180;

// Great-circle distance in km between [lat, lon] pairs
const haversineKm = (a, b) => {
    const h = Math.sin(toRad(b[0] - a[0]) / 2) ** 2
        + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(toRad(b[1] - a[1]) / 2) ** 2;
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
};

// Median filter: each value replaced by the median of its neighbourhood (kills single-point GPS spikes)
const medianSmooth = (values, window) => {
    const half = Math.floor(window / 2);
    return values.map((_, i) => median(values.slice(Math.max(0, i - half), i + half + 1)));
};

// Reduces [[x, y], ...] to at most `target` points by averaging equal-width buckets of points (keeps the shape,
// and the first and last point). Series shorter than the target are returned as they are.
const downsample = (points, target) => {
    if (points.length <= target) return points.map(([x, y]) => [x, y]);
    const size = points.length / target;
    const out = [];
    for (let b = 0; b < target; b++) {
        const slice = points.slice(Math.floor(b * size), Math.max(Math.floor((b + 1) * size), Math.floor(b * size) + 1));
        out.push([Math.round(mean(slice.map((p) => p[0]))), mean(slice.map((p) => p[1]))]);
    }
    out[0] = [points[0][0], points[0][1]];
    out[out.length - 1] = [points[points.length - 1][0], points[points.length - 1][1]];
    return out;
};

// Fraction p (0-1) of a sorted-or-not list
const percentile = (xs, p) => {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};

module.exports = { mean, median, maxOf, minOf, round, haversineKm, medianSmooth, downsample, percentile };
