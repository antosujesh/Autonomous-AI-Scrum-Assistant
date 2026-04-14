// scheduler_helpers.js - sendReminders logic extracted for reuse
const { getOverdueTasks, markReminderSent } = require('./db');
const { normalizePhone } = require('./utils');

async function sendReminders(getSock, getConnectionInfo) {
    const sock = getSock();
    const conn = getConnectionInfo();
    if (!sock || conn.status !== 'CONNECTED') {
        console.log('[Reminders] WhatsApp not ready. Skipping.');
        return;
    }
    try {
        const overdueTasks = await getOverdueTasks();
        console.log(`[Reminders] Found ${overdueTasks.length} overdue tasks.`);
        for (const task of overdueTasks) {
            try {
                const jid = `${normalizePhone(task.PhoneNumber)}@s.whatsapp.net`;
                const message = `*REMINDER*\n\nTask: ${task.Description}\nDue Date: ${new Date(task.DueDate).toLocaleString()}`;
                await sock.sendMessage(jid, { text: message });

                if (task.FollowUpPhoneNumber) {
                    const followerJid = `${normalizePhone(task.FollowUpPhoneNumber)}@s.whatsapp.net`;
                    const followerMessage = `*OVERDUE ALERT (Follow-Up)*\n\nTask assigned to *${task.PersonName}* is overdue:\n\nTask: ${task.Description}\nDue: ${new Date(task.DueDate).toLocaleString()}`;
                    try { await sock.sendMessage(followerJid, { text: followerMessage }); } catch(err) { console.error('[Reminders] Failed sending follow-up to', followerJid, err.message); }
                }

                await markReminderSent(task.Id);
                console.log(`[Reminders] Reminder sent for task ${task.Id}`);
            } catch (taskErr) {
                console.error(`[Reminders] Failed for task ${task.Id}:`, taskErr.message);
            }
        }
    } catch (err) {
        console.error('[Reminders] Error:', err);
    }
}

async function sendImmediateReminders(getSock, getConnectionInfo) {
    const sock = getSock();
    const conn = getConnectionInfo();
    if (!sock || conn.status !== 'CONNECTED') return;

    try {
        const { getTasksToRemindNow, markReminderSent } = require('./db');
        const tasks = await getTasksToRemindNow();
        if (tasks.length === 0) return;

        console.log(`[JobManager] Sending ${tasks.length} immediate reminders...`);

        for (const task of tasks) {
            try {
                const jid = `${normalizePhone(task.PhoneNumber)}@s.whatsapp.net`;
                const deadline = new Date(task.ReDueDate || task.DueDate).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' });
                
                const ownerMsg = `🚨 *TASK DEADLINE REACHED* 🚨\n\n📋 *Task*: ${task.Description}\n⏰ *Deadline*: ${deadline}\n\n*What is the update and new EDC (Expected Date of Completion)?* Please reply with the details and a new date if you need to reschedule.`;
                await sock.sendMessage(jid, { text: ownerMsg });

                // Link this to AI history so the bot knows the context when they reply
                const { saveChatMessage } = require('./db');
                await saveChatMessage(task.PersonId, 'ai', ownerMsg);

                if (task.FollowUpPhoneNumber) {
                    const followerJid = `${normalizePhone(task.FollowUpPhoneNumber)}@s.whatsapp.net`;
                    const followerMsg = `🚨 *DEADLINE ALERT (Follow-Up)* 🚨\n\nTask assigned to *${task.PersonName}* has reached its deadline:\n\n📋 *Task*: ${task.Description}\n⏰ *Deadline*: ${deadline}`;
                    try { await sock.sendMessage(followerJid, { text: followerMsg }); } catch(err) {}
                }

                await markReminderSent(task.Id);
            } catch (err) {
                console.error(`[ImmediateReminders] Failed for task ${task.Id}:`, err.message);
            }
        }
    } catch (err) {
        console.error('[ImmediateReminders] Error:', err.message);
    }
}

module.exports = { sendReminders, sendImmediateReminders };
