const cron = require('node-cron');
const { getScheduledJobs, updateJobLastRun, getAllSettings } = require('./db');

// In-memory registry of active cron tasks: { id: cronTask }
const activeTasks = {};

/**
 * (Re)load all enabled jobs from DB and schedule them.
 * Call this on startup and after any job change.
 */
async function reloadJobs(getSock, getConnectionInfo) {
    // Stop all existing tasks
    Object.keys(activeTasks).forEach(id => {
        activeTasks[id].stop();
        delete activeTasks[id];
    });

    let jobs = [];
    let settings = {};
    try {
        jobs = await getScheduledJobs();
        settings = await getAllSettings();
    } catch (e) {
        console.error('[JobManager] Failed to load jobs or settings from DB:', e.message);
        return;
    }

    for (const job of jobs) {
        if (!job.IsEnabled) continue;

        if (!cron.validate(job.CronExpression)) {
            console.warn(`[JobManager] Invalid cron expression for job "${job.Name}": ${job.CronExpression}`);
            continue;
        }

        const task = cron.schedule(job.CronExpression, async () => {
            console.log(`[JobManager] Running job: "${job.Name}" (${job.JobType})`);
            try {
                await runJob(job.JobType, getSock, getConnectionInfo);
                await updateJobLastRun(job.Id);
            } catch (err) {
                console.error(`[JobManager] Job "${job.Name}" failed:`, err.message);
            }
        });

        activeTasks[job.Id] = task;
        console.log(`[JobManager] Scheduled: "${job.Name}" → ${job.CronExpression}`);

        // Handle pre-scrum reminders (only if enabled in settings)
        if (settings.EnableScrumReminders === 'true' && (job.JobType === 'scrum' || job.JobType === 'weekly_scrum')) {
            const leadTime = parseInt(settings.ScrumReminderLeadTime) || 30;
            const reminderCron = getReminderCron(job.CronExpression, leadTime);
            if (reminderCron) {
                const rTask = cron.schedule(reminderCron, async () => {
                    console.log(`[JobManager] Running ${leadTime}m Reminder for Scrum: "${job.Name}"`);
                    try {
                        await runJob('scrum_announcement', getSock, getConnectionInfo, job.Name, leadTime);
                    } catch (err) {
                        console.error(`[JobManager] Reminder failed for "${job.Name}":`, err.message);
                    }
                });
                activeTasks[`reminder_${job.Id}`] = rTask;
            }
        }
    }

    // Runs every minute to check for timed-out scrum sessions AND send immediate reminders
    const watchdog = cron.schedule('* * * * *', async () => {
        const sock = getSock();
        if (!sock || getConnectionInfo().status !== 'CONNECTED') return;

        try {
            const { getExpiredScrumSessions, getAllSettings } = require('./db');
            const { processScrumTimeout } = require('./scrum');
            const { sendImmediateReminders } = require('./scheduler_helpers');
            
            // 1. Handle Scrum Timeouts
            const settings = await getAllSettings();
            const timeout = parseInt(settings.ScrumReplyTimeout) || 10;
            const expired = await getExpiredScrumSessions(timeout, new Date());

            for (const session of expired) {
                await processScrumTimeout(sock, session, new Date());
            }

            // 2. Handle Immediate Task Reminders
            await sendImmediateReminders(getSock, getConnectionInfo);

        } catch (err) {
            console.error('[JobManager] Watchdog error:', err.message);
        }
    });
    activeTasks['watchdog'] = watchdog;
}

/**
 * Helper to subtract minutes from a standard cron string (min hour * * *)
 */
function getReminderCron(cron, minutesBefore) {
    const parts = cron.split(' ');
    if (parts.length < 2) return null;

    let [min, hour] = parts.map(p => isNaN(p) ? p : parseInt(p));
    
    // Only handle simple numeric minutes and hours
    if (typeof min === 'number' && typeof hour === 'number') {
        min -= minutesBefore;
        while (min < 0) {
            min += 60;
            hour -= 1;
        }
        if (hour < 0) hour = 23; // Simple wrapping, doesn't handle day shift complexly
        
        parts[0] = min;
        parts[1] = hour;
        return parts.join(' ');
    }
    return null;
}

/**
 * Execute a job by type.
 */
async function runJob(jobType, getSock, getConnectionInfo) {
    const sock = getSock();
    const conn = getConnectionInfo();

    if (!sock || conn.status !== 'CONNECTED') {
        console.log(`[JobManager] WhatsApp not connected — skipping "${jobType}"`);
        return;
    }

    if (jobType === 'reminders') {
        const { sendReminders } = require('./scheduler');
        await sendReminders(getSock, getConnectionInfo);
    } else if (jobType === 'scrum') {
        const { getPeople } = require('./db');
        const { startScrumForPerson } = require('./scrum');
        const people = await getPeople();

        // Get current time in HH:mm format
        const now = new Date();
        const currentTime = now.toLocaleTimeString('en-US', { 
            hour12: false, 
            hour: '2-digit', 
            minute: '2-digit',
            timeZone: 'Asia/Kolkata' 
        });

        console.log(`[JobManager] Checking daily scrums for time: ${currentTime}`);

        for (const person of people) {
            if (person.Role === 'Boss') continue; // Don't scrum the boss
            
            const scheduledTime = person.DailyScrumTime || '10:00';
            if (scheduledTime === currentTime) {
                try {
                    console.log(`[JobManager] Triggering scheduled scrum for ${person.Name} at ${currentTime}`);
                    await startScrumForPerson(sock, person.Id, person.Name, person.PhoneNumber);
                } catch (err) {
                    console.error(`[JobManager] Daily Scrum failed for ${person.Name}:`, err.message);
                }
            }
        }
    } else if (jobType === 'scrum_announcement') {
        const { getPeople } = require('./db');
        const { normalizePhone } = require('./utils');
        const people = await getPeople();
        const scrumName = arguments[3] || "Scrum"; // Name of the triggering job
        const leadTime = arguments[4] || 30; // Minutes before
        
        for (const person of people) {
            if (person.Role === 'Boss') continue; 
            try {
                const jid = `${normalizePhone(person.PhoneNumber)}@s.whatsapp.net`;
                const message = `⏰ *Scrum Heads-up!*\n\nHi ${person.Name}, your scheduled *${scrumName}* starts in about ${leadTime} minutes. Please be ready!`;
                await sock.sendMessage(jid, { text: message });
                
                // Log this to all active tasks for the person
                const { getTasks, logTaskActivity } = require('./db');
                const allTasks = await getTasks();
                const activeTasks = allTasks.filter(t => t.PersonId === person.Id && t.Status !== 'Completed');
                for (const task of activeTasks) {
                    await logTaskActivity(task.Id, 'AI', message);
                }
            } catch (err) {
                console.error(`[JobManager] Announcement failed for ${person.Name}:`, err.message);
            }
        }
    } else if (jobType === 'weekly_scrum') {
        const { getPeople } = require('./db');
        const { startWeeklyScrumForPerson } = require('./scrum');
        const people = await getPeople();
        for (const person of people) {
            if (person.Role === 'Boss') continue; 
            try {
                await startWeeklyScrumForPerson(sock, person.Id, person.Name, person.PhoneNumber);
            } catch (err) {
                console.error(`[JobManager] Weekly Scrum failed for ${person.Name}:`, err.message);
            }
        }
    } else if (jobType === 'boss_report') {
        const { sendBossReport } = require('./boss');
        await sendBossReport(getSock, getConnectionInfo, 'cron');
    }
}

module.exports = { reloadJobs, runJob };
