// File: helpers/logger.js
const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');

// Read retention days from .env, default to 7 if missing or invalid
const RETENTION_DAYS = parseInt(process.env.LOG_RETENTION_DAYS, 10) || 7;
let isDebugEnabled = false;

// Ensure logs directory exists synchronously on startup
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

function getLogFilename() {
    const date = new Date().toISOString().split('T')[0];
    return path.join(LOG_DIR, `bot-${date}.log`);
}

function formatMessage(level, label, data = '') {
    const timestamp = new Date().toISOString();
    let msg = `[${timestamp}] [${level}] === ${label} ===`;
    if (data) {
        msg += typeof data === 'object' ? '\n' + JSON.stringify(data, null, 2) : '\n' + data;
    }
    return msg + '\n';
}

function writeLog(level, label, data = '') {
    const msg = formatMessage(level, label, data);
    
    // Print to terminal
    if (level === 'ERROR') console.error(msg.trim());
    else console.log(msg.trim());

    // Append to daily log file (ALWAYS runs for INFO and ERROR)
    fs.appendFile(getLogFilename(), msg, (err) => {
        if (err) console.error("Logger failed to write to file:", err);
    });
}

exports.setDebug = (val) => isDebugEnabled = val;

exports.info = (label, data) => writeLog('INFO', label, data);
exports.error = (label, data) => writeLog('ERROR', label, data);
exports.debug = (label, data) => {
    // DEBUG logs only write to console and file if --debug is passed
    if (isDebugEnabled) writeLog('DEBUG', label, data);
};

// Configurable Cleanup Function
exports.cleanOldLogs = async () => {
    try {
        const files = await fs.promises.readdir(LOG_DIR);
        const now = Date.now();
        const maxAge = RETENTION_DAYS * 24 * 60 * 60 * 1000;

        for (const file of files) {
            if (file.endsWith('.log')) {
                const filePath = path.join(LOG_DIR, file);
                const stats = await fs.promises.stat(filePath);
                
                // If the file is older than LOG_RETENTION_DAYS, delete it
                if (now - stats.mtime.getTime() > maxAge) {
                    await fs.promises.unlink(filePath);
                    exports.info("Log Cleanup", `Deleted old log: ${file} (Retention: ${RETENTION_DAYS} days)`);
                }
            }
        }
    } catch (err) {
        exports.error("Log Cleanup Failed", err);
    }
};
