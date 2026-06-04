// persistence/utils/tsSync.js
const BUCKET_INTERVAL = 5000;

function tsSync(raw_timestamp) {
    const ms = new Date(raw_timestamp).getTime();
    if (isNaN(ms)) {
        console.log(`invalid date timestamp: ${raw_timestamp}`);
        throw new Error(`Invalid timestamp: ${raw_timestamp}`);
    }
    return Math.floor(ms / BUCKET_INTERVAL) * BUCKET_INTERVAL;
}

module.exports = { tsSync };