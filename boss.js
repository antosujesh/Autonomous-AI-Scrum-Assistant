const { getTasks, getBoss, getHeadForPerson, saveBossReport, getPeople } = require('./db');
const { normalizePhone } = require('./utils');

/**
 * After a scrum session ends for personId,
 * notify their Head (if any) with a task summary.
 */
async function notifyHead(sock, personId, personName) {
    try {
        const head = await getHeadForPerson(personId);
        if (!head || !head.PhoneNumber) return;

        const tasks = await getTasks();
        const personTasks = tasks.filter(t => t.PersonId === personId && t.Status !== 'Completed');

        if (personTasks.length === 0) return;

        let msg = `📋 *Scrum Update — ${personName}*\n\n`;
        personTasks.forEach((t, i) => {
            msg += `${i + 1}. ${t.Description}\n`;
            msg += `   Status: *${t.Status}*`;
            if (t.Remarks) {
                const lastRemark = t.Remarks.split('\n').filter(Boolean).pop();
                if (lastRemark) msg += `\n   Note: ${lastRemark}`;
            }
            msg += '\n\n';
        });

        const jid = `${normalizePhone(head.PhoneNumber)}@s.whatsapp.net`;
        await sock.sendMessage(jid, { text: msg });
        console.log(`[Boss] Sent scrum update to Head: ${head.Name}`);
    } catch (err) {
        console.error('[Boss] Failed to notify head:', err.message);
    }
}

/**
 * Send a full consolidated report to the Boss.
 * Groups tasks by Head / department.
 */
async function sendBossReport(getSock, getConnectionInfo, triggeredBy = 'manual') {
    const sock = getSock();
    const conn = getConnectionInfo();

    if (!sock || conn.status !== 'CONNECTED') {
        throw new Error('WhatsApp not connected');
    }

    const boss = await getBoss();
    if (!boss) throw new Error('No Boss found. Set a person with Role = Boss first.');

    const tasks = await getTasks();
    const people = await getPeople();

    // Build member map
    const memberMap = {};
    people.forEach(p => { memberMap[p.Id] = p; });

    // Group by Head
    const byHead = {};
    tasks.forEach(task => {
        const person = memberMap[task.PersonId];
        if (!person) return;
        const headId = person.ReportsToId || '__none__';
        if (!byHead[headId]) byHead[headId] = [];
        byHead[headId].push({ task, person });
    });

    const date = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
    let report = `👑 *Daily Boss Report — ${date}*\n`;
    report += `_Triggered by: ${triggeredBy}_\n\n`;

    let totalTasks = 0, completedTasks = 0;

    for (const [headId, entries] of Object.entries(byHead)) {
        const head = headId === '__none__' ? null : memberMap[headId];
        report += `━━━━━━━━━━━━━━━━━━━\n`;
        report += head ? `👤 *${head.Name} (Head)*\n` : `📌 *Direct / Ungrouped*\n`;
        report += `━━━━━━━━━━━━━━━━━━━\n\n`;

        const grouped = {};
        entries.forEach(({ task, person }) => {
            if (!grouped[person.Name]) grouped[person.Name] = [];
            grouped[person.Name].push(task);
        });

        for (const [name, memberTasks] of Object.entries(grouped)) {
            report += `• *${name}*\n`;
            memberTasks.forEach(t => {
                totalTasks++;
                if (t.Status === 'Completed') completedTasks++;
                const status = t.Status === 'Completed' ? '✅' : t.Status === 'In Progress' ? '🔵' : '⏳';
                report += `  ${status} ${t.Description}\n`;
                if (t.Remarks) {
                    const lastNote = t.Remarks.split('\n').filter(Boolean).pop();
                    if (lastNote) report += `     💬 ${lastNote}\n`;
                }
            });
            report += '\n';
        }
    }

    report += `━━━━━━━━━━━━━━━━━━━\n`;
    report += `📊 *Summary: ${completedTasks}/${totalTasks} tasks completed*\n`;

    const bossJid = `${normalizePhone(boss.PhoneNumber)}@s.whatsapp.net`;
    await sock.sendMessage(bossJid, { text: report });

    await saveBossReport(report, triggeredBy);

    console.log(`[Boss] Report sent to ${boss.Name} (${boss.PhoneNumber}).`);
    return report;
}

module.exports = { notifyHead, sendBossReport };
