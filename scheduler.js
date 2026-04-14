const { sendReminders } = require('./scheduler_helpers');

// Re-export so ui_server.js can still do require('./scheduler').sendReminders
// Real scheduling is handled by job_manager.js (called from ui_server.js/index.js)
function initScheduler(getSock, getConnectionInfo) {
    const { reloadJobs } = require('./job_manager');
    reloadJobs(getSock, getConnectionInfo)
        .then(() => console.log('[Scheduler] Jobs loaded from DB.'))
        .catch(err => console.error('[Scheduler] Failed to load jobs:', err.message));
}

module.exports = { initScheduler, sendReminders };
