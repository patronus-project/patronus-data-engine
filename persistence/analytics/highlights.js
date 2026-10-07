// The "wow" cards: the numbers about a trip people actually want to read out loud. Numbers and short English only;
// clock times are left as raw `t` for the UI to format in the viewer's timezone.

const { round } = require('./stats');
const { HIGHWAY_KMH } = require('./constants');

const MS_PER_HOUR = 3600000;
const KG_CO2_ABSORBED_PER_TREE_YEAR = 21;
const BURJ_KHALIFA_M = 828;
const MIN_POINT_TO_POINT_PCT = 40;   // straight line at least this share of the distance driven

const hours = (ms) => round(ms / MS_PER_HOUR, 1);

// Each: { id, label, value, unit, detail?, t?, tone? } — only cards with a real value are returned
const buildHighlights = ({ summary, engine, plan }) => {
    const cards = [];
    const add = (card) => { if (card.value !== null && card.value !== undefined) cards.push(card); };
    const days = summary.days.length;

    add({ id: 'distance', label: 'Distance driven', value: summary.distanceKm, unit: 'km', detail: `${days} ${days === 1 ? 'day' : 'days'} · ${hours(summary.drivingMs)} h at the wheel` });
    add({ id: 'driving-time', label: 'Time at the wheel', value: hours(summary.drivingMs), unit: 'h', detail: `trip time ${hours(summary.tripTimeMs)} h with short breaks · ${hours(summary.spanMs)} h from first ping to last` });
    add({ id: 'top-speed', label: 'Top speed', value: summary.maxKmh, unit: 'km/h', t: summary.maxKmhAt ? summary.maxKmhAt.t : null, detail: summary.avgMovingKmh ? `average ${summary.avgMovingKmh} km/h while moving` : null });
    if (summary.longestStretch) {
        add({ id: 'longest-stretch', label: 'Longest non-stop stretch', value: summary.longestStretch.km, unit: 'km', t: summary.longestStretch.start, detail: `${hours(summary.longestStretch.ms)} h without stopping` });
    }
    if (summary.breaks.longest) {
        add({ id: 'longest-break', label: summary.breaks.longest.kind === 'long' ? 'Longest rest' : 'Longest break', value: hours(summary.breaks.longest.ms), unit: 'h', t: summary.breaks.longest.start, detail: `${summary.breaks.count} ${summary.breaks.count === 1 ? 'break' : 'breaks'} of 30 min or more` });
    }
    add({ id: 'fuel', label: 'Fuel burnt', value: summary.fuel.usedL, unit: 'L', detail: summary.fuel.kmPerL ? `${summary.fuel.kmPerL} km/L · ${summary.fuel.lPer100Km} L/100 km` : null });
    if (summary.fuel.co2Kg !== null) {
        add({ id: 'co2', label: 'CO₂ emitted', value: summary.fuel.co2Kg, unit: 'kg', detail: `a tree takes about ${round(summary.fuel.co2Kg / KG_CO2_ABSORBED_PER_TREE_YEAR, 1)} years to absorb that` });
    }
    if (summary.elevation.gainM) {
        add({ id: 'climb', label: 'Total climb', value: summary.elevation.gainM, unit: 'm', detail: `${round(summary.elevation.gainM / BURJ_KHALIFA_M, 1)}× the Burj Khalifa · highest point ${summary.elevation.maxM} m`, t: summary.elevation.maxAt });
    }
    add({ id: 'smoothness', label: 'Smoothness score', value: summary.driving.score, unit: '/100', tone: summary.driving.label, detail: `${summary.driving.hardBrake} hard brakes · ${summary.driving.hardAccel} hard accelerations` });
    add({
        id: 'highway', label: 'Highway driving', value: summary.distanceKm > 0 ? round((summary.highwayKm / summary.distanceKm) * 100, 0) : null, unit: '%',
        detail: `${round(summary.highwayKm, 0)} of ${round(summary.distanceKm, 0)} km driven at ${HIGHWAY_KMH} km/h or more`
    });
    const express = summary.expressway;
    if (express.km > 0) {
        add({
            id: 'expressway', label: 'Expressway driving', value: express.km, unit: 'km',
            detail: `${express.sharePct}% of the distance at an average ${express.avgKmh} km/h · longest ${express.longest.km} km${express.kmPerL ? ` · ${express.kmPerL} km/L` : ''}`,
            t: express.longest.start
        });
    }
    add({ id: 'night', label: 'After dark', value: summary.movingMs > 0 ? round((summary.nightMs / summary.movingMs) * 100, 0) : null, unit: '%', detail: 'of moving time between 7 pm and 5 am' });
    add({ id: 'stop-and-go', label: 'Crawling traffic', value: summary.movingMs > 0 ? round((summary.crawlMs / summary.movingMs) * 100, 0) : null, unit: '%', detail: `of moving time under 20 km/h · ${summary.stops} full stops` });
    // Only meaningful for a point-to-point trip: a round trip ends where it began and "as the crow flies" says nothing
    if (summary.straightLine.km !== null && summary.straightLine.efficiencyPct >= MIN_POINT_TO_POINT_PCT) {
        add({ id: 'straight-line', label: 'As the crow flies', value: summary.straightLine.km, unit: 'km', detail: `start to end in a straight line — the road was ${summary.straightLine.efficiencyPct ? round(100 / summary.straightLine.efficiencyPct * 100 - 100, 0) : '—'}% longer` });
    }
    add({ id: 'engine-heat', label: 'Hottest engine', value: engine.coolant.max, unit: '°C', detail: engine.coolant.msAboveAmber ? `${round(engine.coolant.msAboveAmber / 60000, 0)} min above ${engine.coolant.amber} °C` : 'never above the amber line' });
    add({ id: 'battery', label: 'Battery voltage dips to', value: engine.voltage.typicalLow, unit: 'V', detail: engine.voltage.avg ? `${engine.voltage.avg} V on average while running` : null });
    if (summary.fuel.refuels.length) {
        add({ id: 'fillups', label: 'Fill-ups', value: summary.fuel.refuels.length, unit: '', detail: summary.fuel.refuels.map((r) => `km ${r.km}`).join(' · ') });
    }
    add({ id: 'best-speed', label: 'Most efficient at', value: plan.cruise ? `${plan.cruise.from}–${plan.cruise.to}` : null, unit: 'km/h', detail: plan.cruise ? `${plan.cruise.kmPerL} km/L at that speed` : null });
    return cards;
};

module.exports = { buildHighlights };
