// Torque Pro upload keys the analytics read (see data.json for every key). Thresholds are tuning knobs, not physics.

const KEY = {
    speed: 'kd',            // OBD vehicle speed, km/h
    rpm: 'kc',
    load: 'k4',             // engine load, %
    coolant: 'k5',          // °C
    oil: 'k5c',             // °C
    throttle: 'k11',        // %
    fuelLevel: 'k2f',       // tank level, %
    voltageEcu: 'k42',      // V
    voltageAdapter: 'kff1238',
    ambient: 'k46',         // °C
    intake: 'kf',           // °C
    flowLph: 'kff125d',     // fuel flow, L/h
    torqueLat: 'kff1006',
    torqueLon: 'kff1005'
};

// Driving state
const MOVING_KMH = 5;
const STOPPED_KMH = 3;
const ENGINE_RUNNING_RPM = 400;
const HIGH_RPM = 3500;
const HIGHWAY_KMH = 55;               // highway pace in India: its highways average about 55 km/h, so 80 would hide most of a real highway drive
// Expressway: a sustained high pace. The average speed over a 5 minute window must be at least this; a consistent 100-120 km/h
// cruise clears it comfortably, a short burst does not. A fast patch shorter than the minimum length is not an expressway.
const EXPRESSWAY_AVG_KMH = 85;
const EXPRESSWAY_WINDOW_MS = 5 * 60 * 1000;
const EXPRESSWAY_MIN_SECTION_KM = 5;
const CRAWL_KMH = 20;              // moving slower than this is stop-and-go
const MAX_DRIVING_GAP_MS = 60 * 1000;   // a longer silence between pings isn't attributed to driving
const MAX_PLAUSIBLE_KMH = 250;

// Breaks — same thresholds as the web UI (getTelemetryStatus): 30 min–4 h short, 4 h+ long
const SHORT_BREAK_MS = 30 * 60 * 1000;
const LONG_BREAK_MS = 4 * 60 * 60 * 1000;
const STOP_WORTH_LISTING_MS = 15 * 60 * 1000;   // a pause this long is shown as a place you stopped

// Hard events: Torque pings can arrive in bursts, so never divide a speed change by less than this
const HARD_RATE_KMH_PER_S = 5;
const HARD_EVENT_MAX_GAP_MS = 15 * 1000;
const MIN_RATE_DT_MS = 4000;
const STANDARD_GRAVITY = 9.81;

// Fuel
const REFUEL_MIN_JUMP_PCT = 8;     // a tank-level rise of at least this many points is a fill-up
const MIN_FUEL_FIT_DROP_PCT = 5;   // need at least this much level drop to estimate tank size
const CO2_KG_PER_LITRE = 2.31;     // petrol; the analytics assume a petrol car

// Elevation: smooth the noisy GPS altitude, then count a climb only past this hysteresis
const ELEVATION_SMOOTH_WINDOW = 9;
const ELEVATION_HYSTERESIS_M = 6;

// Local time for night driving / hour-of-day / day boundaries. The trips are driven in IST; a fixed offset keeps the
// stored numbers deterministic (the server's own timezone would differ between machines).
const TRIP_TZ_OFFSET_MIN = 330;
const NIGHT_FROM_HOUR = 19;
const NIGHT_TO_HOUR = 5;

// Output sizes
const CHART_POINTS = 240;
const ROUTE_POINTS = 400;
const PLAN_SEGMENTS = 20;
const MAX_TIMELINE_EVENTS = 160;

// Speed bands used by histograms and the efficiency curve: [from, to)
const SPEED_BANDS = [[5, 20], [20, 40], [40, 60], [60, 80], [80, 100], [100, 120], [120, 999]];
const RPM_BANDS = [[400, 1000], [1000, 1500], [1500, 2000], [2000, 2500], [2500, 3000], [3000, 3500], [3500, 9999]];

module.exports = {
    KEY, MOVING_KMH, STOPPED_KMH, ENGINE_RUNNING_RPM, HIGH_RPM, HIGHWAY_KMH, EXPRESSWAY_AVG_KMH, EXPRESSWAY_WINDOW_MS, EXPRESSWAY_MIN_SECTION_KM, CRAWL_KMH, MAX_DRIVING_GAP_MS,
    MAX_PLAUSIBLE_KMH, SHORT_BREAK_MS, LONG_BREAK_MS, STOP_WORTH_LISTING_MS, HARD_RATE_KMH_PER_S,
    HARD_EVENT_MAX_GAP_MS, MIN_RATE_DT_MS, STANDARD_GRAVITY, REFUEL_MIN_JUMP_PCT, MIN_FUEL_FIT_DROP_PCT,
    CO2_KG_PER_LITRE, ELEVATION_SMOOTH_WINDOW, ELEVATION_HYSTERESIS_M, TRIP_TZ_OFFSET_MIN, NIGHT_FROM_HOUR,
    NIGHT_TO_HOUR, CHART_POINTS, ROUTE_POINTS, PLAN_SEGMENTS, MAX_TIMELINE_EVENTS, SPEED_BANDS, RPM_BANDS
};
