const { 
    getActiveScrumSession, 
    startScrumSession, 
    advanceScrumSession, 
    endScrumSession, 
    getTasksForWeek,
    updateTaskStatus,
    updateTaskRemarks,
    logTaskActivity,
    getTasks,
    getLeadsForPerson,
    refreshScrumSessionTime,
    getPeople,
    createTask
} = require('./db');

const { normalizePhone } = require('./utils');
const { getAIResponse } = require('./ai_engine');

/**
 * Helper to determine if a task is overdue and generate the appropriate question.
 */
function getScrumQuestion(task, type, index, total) {
    if (type === 'Weekly') {
        return `*Task ${index + 1} of ${total}*\nDetail: ${task.Description}\nDue: ${new Date(task.DueDate).toLocaleString()}\n\n❓ *Why was this task not completed?*`;
    }

    const now = new Date();
    const dueDate = new Date(task.ReDueDate || task.DueDate);
    const isOverdue = dueDate < now;

    if (isOverdue) {
        return `*Task ${index + 1} of ${total}*\nDetail: ${task.Description}\nDue: ${dueDate.toLocaleString()}\n\n⚠️ *This task is overdue.*\n*What is the update and Expected Date of Completion (EDC)?*`;
    } else {
        return `*Task ${index + 1} of ${total}*\nDetail: ${task.Description}\nDue: ${dueDate.toLocaleString()}\n\n❓ *Any deviation or blockers for this task?* (If yes, I can create a blocker task for you).`;
    }
}

async function startScrumForPerson(sock, personId, name, phoneNumber) {
    console.log(`Checking scrum tasks for ${name} (ID: ${personId})...`);
    
    // Only includes tasks due in the current week (Sunday to Saturday)
    const allWeeklyTasks = await getTasksForWeek(personId);
    const incompleteTasks = allWeeklyTasks.filter(t => t.Status !== 'Completed');
    
    console.log(`Found ${incompleteTasks.length} week-pending tasks for ${name}.`);

    const taskIds = incompleteTasks.map(t => t.Id);
    await startScrumSession(personId, taskIds);
    
    const jid = `${normalizePhone(phoneNumber)}@s.whatsapp.net`;
    
    // Select a random cheer for motivation
    const cheers = [
        "Good morning! ☀️ Let's kick off the day with some great energy! Ready for the daily scrum?",
        "Hello! 🚀 A new day, a new opportunity! Let's get updated on your progress.",
        "Hey there! ✨ You're doing awesome work. Let's briefly sync on your tasks for today!",
        "Morning! 🌈 Let's make today productive. Ready to start your scrum?",
        "Hi! 🌟 Leveling up today! Let's check in on where we are."
    ];
    const dailyCheer = cheers[Math.floor(Math.random() * cheers.length)];

    if (incompleteTasks.length === 0) {
        // Skip straight to the final question if no tasks
        const intro = `🚀 *Daily Scrum Time - ${new Date().toLocaleDateString()}*\n\nHi ${name},\n${dailyCheer}\n\nYou have no specific tasks assigned for this week.`;
        await sock.sendMessage(jid, { text: intro });
        const question = "📝 *Finally, do you have any other pending items or plans for the rest of this week?*";
        await sock.sendMessage(jid, { text: question });
        await refreshScrumSessionTime(personId);
        return true;
    }

    const firstTask = incompleteTasks[0];
    const intro = `🚀 *Daily Scrum Time - ${new Date().toLocaleDateString()}*\n\nHi ${name},\n${dailyCheer}\n\nI'll list your pending tasks one by one.`;
    await sock.sendMessage(jid, { text: intro });

    const question = getScrumQuestion(firstTask, 'Daily', 0, incompleteTasks.length);
    await sock.sendMessage(jid, { text: question });
    await logTaskActivity(firstTask.Id, 'AI', question);
    await refreshScrumSessionTime(personId);
    
    return true;
}

async function sendUpcomingPlanningQuestion(sock, jid, personId) {
    const { getTasksForNextWeek, getPendingOverallTasks } = require('./db');
    
    const nextWeekTasks = await getTasksForNextWeek(personId);
    if (nextWeekTasks.length > 0) {
        let msg = "📅 *Next Week Planning*\n\nI see you already have these tasks planned for next week:\n";
        nextWeekTasks.forEach((t, i) => msg += `${i+1}. ${t.Description}\n`);
        msg += "\n*Does this look correct?* (Confirm or tell me about any additions/changes).";
        await sock.sendMessage(jid, { text: msg });
        return;
    }

    const pendingTasks = await getPendingOverallTasks(personId);
    if (pendingTasks.length > 0) {
        let msg = "📅 *Next Week Planning*\n\nYou don't have anything scheduled for next week yet. Here are some pending items from your backlog:\n";
        pendingTasks.forEach((t, i) => msg += `${i+1}. [ID:${t.Id}] ${t.Description}\n`);
        msg += "\n*Which of these would you like to take up for next week?* (Reply with IDs or just tell me. You can also say 'None').";
        await sock.sendMessage(jid, { text: msg });
        return;
    }

    const emptyMsg = "🌟 *Next Week Planning*\n\nYou have no pending tasks! That's amazing. \n\n*What are your main goals or tasks for the coming week?* I can help you create them now.";
    await sock.sendMessage(jid, { text: emptyMsg });
}

async function startWeeklyScrumForPerson(sock, personId, name, phoneNumber) {
    console.log(`Checking weekly scrum tasks for ${name} (ID: ${personId})...`);
    
    // getTasksForWeek now returns all tasks for the week
    const { getTasksForWeek } = require('./db');
    const allWeeklyTasks = await getTasksForWeek(personId);
    const completedTasks = allWeeklyTasks.filter(t => t.Status === 'Completed');
    const incompleteTasks = allWeeklyTasks.filter(t => t.Status !== 'Completed');
    
    const jid = `${normalizePhone(phoneNumber)}@s.whatsapp.net`;

    // 1. Appreciation Message
    if (completedTasks.length > 0) {
        let appreciation = `🌟 *Great Job This Week, ${name}!* 🌟\n\nYou successfully completed *${completedTasks.length}* tasks:\n`;
        completedTasks.forEach(t => appreciation += `✅ ${t.Description}\n`);
        await sock.sendMessage(jid, { text: appreciation });
    }

    if (incompleteTasks.length === 0) {
        await sock.sendMessage(jid, { text: "🏁 You have no pending tasks from this week. Keep up the amazing work!" });
        
        // Planning Phase
        await startScrumSession(personId, [], 'Weekly'); // Active session with 0 tasks means planning stage
        await sendUpcomingPlanningQuestion(sock, jid, personId);
        await refreshScrumSessionTime(personId);
        return true;
    }

    // 2. Start Weekly Session for Incomplete Tasks
    const taskIds = incompleteTasks.map(t => t.Id);
    await startScrumSession(personId, taskIds, 'Weekly');
    
    const firstTask = incompleteTasks[0];
    const intro = `📝 *Weekly Wrap-up - ${new Date().toLocaleDateString()}*\n\nYou have *${incompleteTasks.length}* tasks that were not marked as completed. Let's capture the reasons for these...`;
    await sock.sendMessage(jid, { text: intro });
    const question = getScrumQuestion(firstTask, 'Weekly', 0, incompleteTasks.length);
    await sock.sendMessage(jid, { text: question });
    const { logTaskActivity } = require('./db');
    await logTaskActivity(firstTask.Id, 'AI', question);
    await refreshScrumSessionTime(personId);
    
    return true;
}

async function handleScrumStep(sock, from, messageText, personId) {
    const session = await getActiveScrumSession(personId);
    if (!session) return false;

    const taskIds = JSON.parse(session.TaskIds);
    const currentIndex = session.CurrentTaskIndex;
    const isWeekly = session.Type === 'Weekly';

    // ─── STATE: Final Wrap-up Question ("Other plans for the week") ───
    if (currentIndex === taskIds.length) {
        // This is the answer to "Any other pending items or plans?"
        try {
            // 1. Generate Planning Context for AI
            const { getTasksForNextWeek, getPendingOverallTasks } = require('./db');
            const nextWeekTasks = await getTasksForNextWeek(personId);
            const pendingTasks = await getPendingOverallTasks(personId);
            
            let taskContext = "AVAILABLE TASKS FOR PLANNING:\n";
            if (nextWeekTasks.length > 0) {
                taskContext += "--- NEXT WEEK'S CURRENT PLAN ---\n";
                nextWeekTasks.forEach(t => taskContext += `[ID: ${t.Id}] ${t.Description} (Current Due: ${t.DueDate})\n`);
            }
            if (pendingTasks.length > 0) {
                taskContext += "--- BACKLOG / PENDING ITEMS ---\n";
                pendingTasks.forEach(t => taskContext += `[ID: ${t.Id}] ${t.Description}\n`);
            }

            const summaryPrompt = isWeekly 
                ? `${taskContext}
                   The user is providing their plans for the UPCOMING week. 
                   - If they say 'No', 'None', or 'No tasks', just end with a thank you.
                   - If they picked existing pending tasks (by ID or description), use the updateTaskStatus tool to set their reDueDate to next Monday.
                   - If they mentioned NEW tasks, use the createTask tool to add them for next week.
                   After updates, provide a brief positive confirmation and end with "Thank you!".`
                : `The user was asked for their additional plans/pending items for the rest of the day. 
                   User message: "${messageText}"
                   Please create a very concise (1-2 sentences), professional summary of these plans. 
                   Do not use tools. Just return the text summary.`;
            
            const aiMessage = await getAIResponse(messageText, [{ role: 'system', content: summaryPrompt }]);
            const planSummaryText = aiMessage.content || messageText;

            // 2. Handle Planning Tools (Create/Reschedule)
            if (aiMessage.tool_calls) {
                for (const toolCall of aiMessage.tool_calls) {
                    if (toolCall.function.name === 'updateTaskStatus' || toolCall.function.name === 'createTask') {
                        // The AI engine tools will handle the DB calls if we use getAIResponse with tools
                        // but here we manually handle for clarity or let the AI engine logic run.
                        // Actually, the current call doesn't pass tools to getAIResponse. 
                        // I'll update it to use the full engine.
                    }
                }
            }

            // 3. Wrap up session
            await endScrumSession(personId);
            await sock.sendMessage(from, { text: isWeekly ? planSummaryText : `✅ *Great!* I've summarized your plans and shared the status with your lead. Have a productive day! 🚀` });

            // 4. Send hierarchical report to leads and consolidated summary to followers
            await notifyLeadsOfScrumCompletion(sock, personId, planSummaryText, session.Type);
            await notifyFollowUpsOfScrumCompletion(sock, personId, taskIds);

        } catch (err) {
            console.error('[Scrum Wrap-up Error]', err);
            await endScrumSession(personId);
            await sock.sendMessage(from, { text: "🏁 Scrum finished! Thanks for your updates." });
        }
        return true;
    }

    // ─── STATE: Standard Task Review ───
    const currentTaskId = taskIds[currentIndex];

    // 1. Capture the reply as a remark for the current task
    await updateTaskRemarks(currentTaskId, messageText);
    await logTaskActivity(currentTaskId, 'User', messageText);

    // 2. Let AI parse the status update
    try {
        const allTasks = await getTasks();
        const currentTask = allTasks.find(t => t.Id === currentTaskId);
        if (currentTask) {
            const now = new Date();
            const dueDate = new Date(currentTask.ReDueDate || currentTask.DueDate);
            const isOverdue = dueDate < now;
            const currentTime = `[Reference Time: ${now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}]`;
            
            let systemPrompt = "";
            if (isWeekly) {
                systemPrompt = `${currentTime} The user is finishing their week. They were asked WHY the task "${currentTask.Description}" was not completed. User's explanation: "${messageText}". Capture this reason in the comment and update status.`;
            } else if (isOverdue) {
                systemPrompt = `${currentTime} The user is providing a Scrum update for an OVERDUE task: "${currentTask.Description}". They were specifically asked for an update and EDC (Expected Date of Completion). Parse this and execute updateTaskStatus. If they provide a new date, use it as reDueDate.`;
            } else {
                systemPrompt = `${currentTime} The user is providing a Scrum update for an in-time task: "${currentTask.Description}". They were asked about deviations or blockers. 
                - If they mention a blocker, use 'createTask' to create a new task with Prefix [BLOCKER]. 
                - If they just say "all ok" or "no blockers", acknowledge it. 
                - Update status to 'In Progress' if they are working on it.`;
            }

            const aiContextHistory = [{ role: 'system', content: systemPrompt }];
            const aiMessage = await getAIResponse(messageText, aiContextHistory);

            if (aiMessage.tool_calls) {
                for (const toolCall of aiMessage.tool_calls) {
                    if (toolCall.function.name === 'updateTaskStatus') {
                        const args = JSON.parse(toolCall.function.arguments);
                        let aiActionLog = `Updated status to ${args.status}.`;
                        if (args.reDueDate) aiActionLog += ` Rescheduled to ${new Date(args.reDueDate).toLocaleString()}.`;
                        await updateTaskStatus(currentTaskId, args.status, args.comment, args.reDueDate, aiActionLog);
                        await logTaskActivity(currentTaskId, 'AI', aiActionLog);

                        // Individual alerts removed to favor consolidated summary at end of session
                    } else if (toolCall.function.name === 'createTask') {
                        const args = JSON.parse(toolCall.function.arguments);
                        // Correct arguments for db.addTask(personId, description, dueDate, followUpPersonId, parentTaskId)
                        // Tool call from openai.js provides { assignToPersonId, description, dueDate }
                        await addTask(args.assignToPersonId, args.description, args.dueDate, null, currentTask.Id); 
                        await sock.sendMessage(from, { text: `✅ Created blocker task: "${args.description}"` });
                    }
                }
            }
        }
    } catch (err) {
        console.error("AI Scrum parse failed:", err);
    }
    
    // 3. Prepare next step
    const nextIndex = currentIndex + 1;
    if (nextIndex < taskIds.length) {
        await advanceScrumSession(personId);
        const allTasks = await getTasks();
        const nextTask = allTasks.find(t => t.Id === taskIds[nextIndex]);
        
        if (nextTask) {
            const question = getScrumQuestion(nextTask, session.Type, nextIndex, taskIds.length);
            await sock.sendMessage(from, { text: question });
            await logTaskActivity(nextTask.Id, 'AI', question);
            await refreshScrumSessionTime(personId);
        } else {
            await endScrumSession(personId);
            await sock.sendMessage(from, { text: "🏁 Scrum finished! (Encountered a minor data sync issue, but your updates were saved)." });
        }
    } else {
        // SHIFT TO PLANNING PHASE instead of generic final question
        await advanceScrumSession(personId); // Moves to index = length
        if (isWeekly) {
            await sendUpcomingPlanningQuestion(sock, from, personId);
        } else {
            const finalQuestion = "📝 *Almost done!* Finally, do you have any other pending items or plans for the rest of this day?";
            await sock.sendMessage(from, { text: finalQuestion });
        }
        await refreshScrumSessionTime(personId);
    }

    return true;
}

/**
 * Generates a consolidated status report and broadcasts it to the proper hierarchy.
 */
async function notifyLeadsOfScrumCompletion(sock, personId, planSummary, sessionType = 'Daily') {
    try {
        const { getPeople, getLeadsForPerson, getHeadForPerson, getBoss, getTasksForWeek, getAllSettings } = require('./db');
        const allPeople = await getPeople();
        const person = allPeople.find(p => p.Id === personId);
        if (!person) return;

        const settings = await getAllSettings();
        const appLogo = settings.AppLogo || '🚀';

        // 1. Determine Recipients (Team Leads -> Head -> Boss)
        let recipients = await getLeadsForPerson(personId);
        if (recipients.length === 0) {
            const head = await getHeadForPerson(personId);
            if (head) recipients = [head];
            else {
                const boss = await getBoss();
                if (boss) recipients = [boss];
            }
        }

        if (recipients.length === 0) return;

        // 2. Gather Pending Tasks for the week
        const weekTasks = await getTasksForWeek(personId);
        const pending = weekTasks.filter(t => t.Status !== 'Completed');

        // 3. Construct the Premium Report
        const reportTitle = sessionType === 'Weekly' ? 'WEEKLY OUTLOOK' : 'DAILY SCRUM SUMMARY';
        let report = `${appLogo} *STATUS UPDATE: ${person.Name.toUpperCase()}*\n\n`;
        
        report += `📝 *${reportTitle}*\n`;
        report += `${planSummary}\n\n`;

        if (pending.length > 0) {
            report += `📋 *PENDING ITEMS (${pending.length})*\n`;
            pending.forEach(t => {
                const due = new Date(t.DueDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
                report += `- ${t.Description} (Due: ${due})\n`;
            });
        } else {
            report += `📋 *PENDING ITEMS*\n- All scheduled tasks are completed! ✨\n`;
        }

        report += `\n_Report generated at ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}_`;

        // 4. Broadcast
        for (const lead of recipients) {
            const leadJid = `${normalizePhone(lead.PhoneNumber)}@s.whatsapp.net`;
            await sock.sendMessage(leadJid, { text: report });
        }
    } catch (err) {
        console.error('[Notification Failed]', err);
    }
}

async function processScrumTimeout(sock, session, now = new Date()) {
    const personId = session.PersonId;
    const taskIds = JSON.parse(session.TaskIds);
    const currentIndex = session.CurrentTaskIndex;
    const currentTaskId = taskIds[currentIndex];
    const from = `${normalizePhone(session.PhoneNumber)}@s.whatsapp.net`;

    console.log(`[TIMEOUT] Scrum session for ${session.PersonName} timed out at task index ${currentIndex}.`);

    // 1. Mark current task as "No reply"
    const timeoutMsg = "⚠️ *Status Update: No reply received from user within the timeout period.*";
    await updateTaskRemarks(currentTaskId, "No reply from user (Auto-Timeout)");
    await logTaskActivity(currentTaskId, 'AI', timeoutMsg);
    
    // Send a polite alert to WhatsApp
    await sock.sendMessage(from, { text: timeoutMsg });

    // 2. Move to next task or end
    const nextIndex = currentIndex + 1;
    if (nextIndex < taskIds.length) {
        await advanceScrumSession(personId);
        const allTasks = await getTasks();
        const nextTask = allTasks.find(t => t.Id === taskIds[nextIndex]);
        
        if (nextTask) {
            const question = getScrumQuestion(nextTask, session.Type, nextIndex, taskIds.length);
            await sock.sendMessage(from, { text: question });
            await logTaskActivity(nextTask.Id, 'AI', question);
            await refreshScrumSessionTime(personId);
        } else {
            await endScrumSession(personId);
        }
    } else {
        await endScrumSession(personId);
        const closing = session.Type === 'Weekly' ? "🏁 *Weekly Session Ended.* Thank you for your time!" : "🏁 *Scrum Auto-Ended* due to inactivity. Have a productive day!";
        await sock.sendMessage(from, { text: closing });
    }
}

/**
 * Sends a simplified summary to each Follow-up Person (and Team Head) at the end of Scrum.
 */
async function notifyFollowUpsOfScrumCompletion(sock, personId, taskIds) {
    try {
        const { getPeople, getTasks, getHeadForPerson } = require('./db');
        const allPeople = await getPeople();
        const person = allPeople.find(p => p.Id === personId);
        if (!person) return;

        const firstName = person.Name.split(' ')[0];
        const allTasks = await getTasks();
        const sessionTasks = allTasks.filter(t => taskIds.includes(t.Id));

        // Group by Follow-up Person JID
        const summaries = {};
        const recipients = new Set();

        // Add Team Head to recipients
        const head = await getHeadForPerson(personId);
        if (head) {
            recipients.add(`${normalizePhone(head.PhoneNumber)}@s.whatsapp.net`);
        }

        for (const task of sessionTasks) {
            if (task.FollowUpPhoneNumber) {
                const jid = `${normalizePhone(task.FollowUpPhoneNumber)}@s.whatsapp.net`;
                recipients.add(jid);
                if (!summaries[jid]) summaries[jid] = [];
                summaries[jid].push(task);
            }
        }

        // Send to each designated follow-up person
        for (const [jid, tasks] of Object.entries(summaries)) {
            let msg = `*${firstName}*\n`;
            tasks.forEach(t => {
                // Use the last meaningful remark or status
                const response = t.Remarks ? t.Remarks.split('\n').filter(l => l.trim()).pop() || t.Status : t.Status;
                msg += `\nItem: ${t.Description}\nResponse: ${response.replace(/^\[.*\]\s*/, '')}\n`;
            });
            await sock.sendMessage(jid, { text: msg });
            recipients.delete(jid); // Remove so we don't send individual summary AND head summary twice if they are the same
        }

        // Send a general summary to the Head if they weren't already a follow-up recipient
        if (recipients.size > 0 && sessionTasks.length > 0) {
            let msg = `*Scrum Update: ${firstName}*\n`;
            sessionTasks.forEach(t => {
                const response = t.Remarks ? t.Remarks.split('\n').filter(l => l.trim()).pop() || t.Status : t.Status;
                msg += `\nItem: ${t.Description}\nResponse: ${response.replace(/^\[.*\]\s*/, '')}\n`;
            });
            for (const jid of recipients) {
                await sock.sendMessage(jid, { text: msg });
            }
        }

    } catch (err) {
        console.error('[Follow-up Summary Failed]', err);
    }
}

module.exports = { startScrumForPerson, startWeeklyScrumForPerson, handleScrumStep, processScrumTimeout };
