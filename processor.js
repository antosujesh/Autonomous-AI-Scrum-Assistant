const { getAIResponse } = require('./ai_engine');
const { updateTaskStatus, getTasks, updateTaskRemarks, getPeople, logTaskActivity, saveChatMessage, getRecentChatHistory, addTask } = require('./db');
const { handleScrumStep } = require('./scrum');
const { normalizePhone } = require('./utils');
const vm = require('vm');
const axios = require('axios');
const cheerio = require('cheerio');

async function processMessage(sock, msg) {
    const from = msg.key.remoteJid;
    const whatsappNumber = from.replace('@s.whatsapp.net', '');
    
    // Robustly extract text from various WhatsApp message structures
    const messageObj = msg.message?.ephemeralMessage?.message || msg.message;
    const messageText = messageObj?.conversation || 
                        messageObj?.extendedTextMessage?.text || 
                        "";

    if (!messageText) {
        console.log(`[IGNORE] Received non-text or empty message from ${from}. Type: ${Object.keys(msg.message || {})}`);
        return;
    }

    try {
        const pushName = msg.pushName || "";
        const whatsappId = from; // The full JID like '... @lid'
        console.log(`[PROCESS] Message from ${from} (Name: ${pushName}): ${messageText}`);
        
        // 1. Find the person in our database
        const db = require('./db');
        const people = await db.getPeople();
        
        // Check 1: Match by saved WhatsAppId (best)
        let person = people.find(p => p.WhatsAppId === whatsappId);

        // Check 2: Match by phone number
        if (!person) {
            person = people.find(p => {
                const dbPhone = p.PhoneNumber.toString().replace(/\D/g, '');
                const waPhone = whatsappNumber.replace(/\D/g, '');
                return waPhone.endsWith(dbPhone) || dbPhone.endsWith(waPhone);
            });
        }

        // Check 3: Fuzzy Name fallback (for linked devices)
        if (!person && (from.endsWith('@lid') || from.includes(':')) && pushName) {
            const pName = pushName.toLowerCase().trim();
            console.log(`Attempting fuzzy name fallback for "${pName}"...`);
            
            person = people.find(p => {
                const dbN = p.Name.toLowerCase().trim();
                const match = dbN === pName || dbN.includes(pName) || pName.includes(dbN);
                if (!match) console.log(`  - No match with DB Name: "${dbN}"`);
                return match;
            });
            
            if (person) {
                console.log(`Auto-linking @lid ${whatsappId} to ${person.Name}`);
                await db.updatePersonWhatsAppId(person.Id, whatsappId);
            }
        }

        if (!person) {
            console.log(`[SECURITY] Silently ignoring message from unregistered number: ${from}`);
            return;
        }

        console.log(`Matched user: ${person.Name} (ID: ${person.Id})`);
        await saveChatMessage(person.Id, 'user', messageText);

            // 2. Check if this is a Scrum reply
            const inScrum = await handleScrumStep(sock, from, messageText, person.Id);
            if (inScrum) return;

            // 3. Manager Command: "update"
            const cmd = messageText.toLowerCase().trim();
            if (['update', 'updates', 'status'].includes(cmd) && ['Head', 'Boss', 'Lead'].includes(person.Role)) {
                console.log(`[MANAGER CMD] ${person.Name} requested follow-up updates...`);
                const allTasks = await getTasks();
                const followedTasks = allTasks.filter(t => t.FollowUpPersonId === person.Id && t.Status !== 'Completed');

                if (followedTasks.length === 0) {
                    await sock.sendMessage(from, { text: "✅ You have no active pending tasks on your follow-up list!" });
                    return;
                }

                let report = `📊 *FOLLOW-UP TRACKER*\n\nYou are following *${followedTasks.length}* active tasks:\n`;
                
                // Group by Assignee
                const grouped = {};
                followedTasks.forEach(t => {
                    if (!grouped[t.PersonName]) grouped[t.PersonName] = [];
                    grouped[t.PersonName].push(t);
                });

                for (const [assignee, tasks] of Object.entries(grouped)) {
                    report += `\n👤 *${assignee}*\n`;
                    tasks.forEach(t => {
                        const lastRemark = t.Remarks ? t.Remarks.split('\n').filter(l => l.trim()).pop() || "No detailed update" : "No updates yet";
                        const cleanRemark = lastRemark.replace(/^\[.*\]\s*/, '');
                        report += `• ${t.Description}\n  └ _${cleanRemark}_\n`;
                    });
                }

                await sock.sendMessage(from, { text: report });
                return;
            }

            // 4. Not in scrum or manager command? The AI will handle general intent below.

            // Load enabled AI Skills (filtered by admin status)
            const { getEnabledSkills } = require('./db');
            const enabledSkills = await getEnabledSkills(person.IsAdmin ? 1 : 0);
            
            let skillsContext = "";
            if (enabledSkills.length > 0) {
                skillsContext = "\n\nCRITICAL CONTEXT (ACTIVE SKILLS):\n" + 
                    enabledSkills.map(s => `--- SKILL: ${s.Name} ---\n${s.Content}`).join('\n\n');
            }

            // 4. Fallback to AI for general intent handling
            let aiContextHistory = [
                {
                    role: 'system',
                    content: `Current System Time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}. 
                    Today is ${new Date().toLocaleDateString('en-IN', { weekday: 'long', timeZone: 'Asia/Kolkata' })}.
                    Use this as the reference for relative dates like "tomorrow", "next week", etc.
                    
                    USER PRIVILEGE: ${person.IsAdmin ? 'ADMIN' : 'MEMBER'}
                    PERMISSION POLICY: 
                    - Only ADMIN users can use 'createSkill'.
                    - If a MEMBER tries to use it, politely inform them it's restricted.
                    ${skillsContext}`
                }
            ];
            
            // Inject Tasks context
            if (person) {
            const allTasks = await getTasks();
            const activeUserTasks = allTasks.filter(t => t.PersonId === person.Id && t.Status !== 'Completed');
            if (activeUserTasks.length > 0) {
                const taskList = activeUserTasks.map((t, i) => `${i+1}. [ID: ${t.Id}] "${t.Description}" (Status: ${t.Status}, Due: ${new Date(t.DueDate).toLocaleString()})`).join('\n');
                aiContextHistory.push({
                    role: 'system',
                    content: `The user ${person.Name} currently has the following pending tasks assigned to them:\n${taskList}\n\nIf they provide an update for a specific item, identify it from this list and use the corresponding [ID] in your tool calls.`
                });
            } else {
                aiContextHistory.push({
                    role: 'system',
                    content: `The user ${person.Name} currently has NO pending tasks.`
                });
            }

            // Inject People context so AI can assign tasks
            const members = people.map(p => `ID: ${p.Id}, Name: ${p.Name}, Role: ${p.Role}`).join('; ');
            aiContextHistory.push({
                role: 'system',
                content: `You can create tasks for the team. Available team members: ${members}. Always ask the user for a specific "Assignee" and "Due Date" if they do not provide them when asking to create a task.`
            });

            // Inject Projects context
            const { getProjects } = require('./db');
            const projectsList = await getProjects();
            const activeProjects = projectsList.filter(p => p.Status === 'Active').map(p => `ID: ${p.Id}, Name: ${p.Name}`).join('; ');
            aiContextHistory.push({
                role: 'system',
                content: `AVAILABLE PROJECTS: ${activeProjects}. When creating or updating tasks, try to associate them with a project ID if the user mentions one. Default to Project ID 1 (General) if unknown.`
            });

            // Inject Reporting Relationship for Watchdog escalation
            const { getHeadForPerson } = require('./db');
            const manager = await getHeadForPerson(person.Id);
            if (manager) {
                aiContextHistory.push({
                    role: 'system',
                    content: `RELEVANT ESCALATION: The user ${person.Name} reports to ${manager.Name} (Phone: ${manager.PhoneNumber}). If you need to alert their manager, use this contact.`
                });
            } else {
                aiContextHistory.push({
                    role: 'system',
                    content: `RELEVANT ESCALATION: This user has no assigned manager in the system. If escalation is needed, inform the user they need to be assigned a manager in the dashboard.`
                });
            }

            // Load conversational memory (Increased to 20 for pattern detection)
            const recentHistory = await getRecentChatHistory(person.Id, 20);
            aiContextHistory.push(...recentHistory);
        }

        let aiResponse = await getAIResponse(messageText, aiContextHistory);
        let loopCount = 0;
        const maxLoops = 5;

        while (aiResponse.tool_calls && loopCount < maxLoops) {
            loopCount++;
            const toolMessages = [];
            
            // Collect all tool outputs in this turn
            for (const toolCall of aiResponse.tool_calls) {
                const functionName = toolCall.function.name;
                const args = JSON.parse(toolCall.function.arguments);
                const toolCallId = toolCall.id;
                let toolOutput = "";

                console.log(`[TOOL] Calling ${functionName} with args:`, args);

                if (functionName === 'updateTaskStatus') {
                    if (!person) {
                        toolOutput = "User not registered.";
                    } else {
                        try {
                            const { taskId, status, comment, reDueDate } = args;
                            const allTasks = await getTasks();
                            const targetTask = allTasks.find(t => t.Id === parseInt(taskId));

                            if (targetTask) {
                                let aiActionLog = `Updated status to ${status}.`;
                                if (reDueDate) aiActionLog += ` Rescheduled to ${new Date(reDueDate).toLocaleString()}.`;
                                await updateTaskStatus(targetTask.Id, status, comment, reDueDate, aiActionLog);
                                
                                if (targetTask.FollowUpPhoneNumber || manager) {
                                    const recipients = new Set();
                                    if (targetTask.FollowUpPhoneNumber) recipients.add(`${normalizePhone(targetTask.FollowUpPhoneNumber)}@s.whatsapp.net`);
                                    if (manager && manager.PhoneNumber) recipients.add(`${normalizePhone(manager.PhoneNumber)}@s.whatsapp.net`);

                                    const followerMessage = `*TASK UPDATE ALERT*\n\nTask: ${targetTask.Description}\nAssigned To: ${targetTask.PersonName}\n\n*Update from ${targetTask.PersonName}:*\n"${messageText}"\n\n*System Actions:*\n${aiActionLog}`;
                                    
                                    for (const jid of recipients) {
                                        try { await sock.sendMessage(jid, { text: followerMessage }); } catch(err) {}
                                    }
                                }
                                toolOutput = `Task [ID: ${targetTask.Id}] "${targetTask.Description}" updated to ${status}.`;
                                await logTaskActivity(targetTask.Id, 'AI', toolOutput);
                            } else {
                                toolOutput = `Reference error: Task ID ${taskId} not found or not assigned to you. Please list your tasks correctly and try again.`;
                            }
                        } catch (e) { toolOutput = `Error updating task: ${e.message}`; }
                    }
                } else if (functionName === 'createTask') {
                    if (!person) {
                        toolOutput = "User not registered.";
                    } else {
                        try {
                            const { assignToPersonId, description, dueDate, projectId, priority, estimateHours } = args;
                            await addTask(assignToPersonId, description, dueDate, null, null, projectId, priority, estimateHours);
                            const assignedPerson = people.find(p => p.Id === assignToPersonId);
                            const aName = assignedPerson ? assignedPerson.Name : "Unknown";
                            toolOutput = `Task created and assigned to ${aName} (Due: ${dueDate}, Project ID: ${projectId || 1}, Priority: ${priority || 2}).`;
                            
                            // Notify recipient
                            if (assignedPerson && assignedPerson.Id !== person.Id) {
                                const recipientJid = `${normalizePhone(assignedPerson.PhoneNumber)}@s.whatsapp.net`;
                                await sock.sendMessage(recipientJid, { text: `🆕 *New Task Assigned by ${person.Name}*\n\n📋 ${description}\n⏰ Due: ${new Date(dueDate).toLocaleString()}` });
                            }
                        } catch (e) { toolOutput = `Error creating task: ${e.message}`; }
                    }
                } else if (functionName === 'sendMessage') {
                    const recipient = args.phoneNumber.includes('@s.whatsapp.net') ? args.phoneNumber : `${args.phoneNumber.replace(/\D/g, '')}@s.whatsapp.net`;
                    await sock.sendMessage(recipient, { text: args.text });
                    toolOutput = "Message sent successfully.";
                } else if (functionName === 'executeCode') {
                    try {
                        const { getAllSettings } = require('./db');
                        const settings = await getAllSettings();
                        
                        if (settings.CodeExecution_AllowExecute !== 'true') {
                            toolOutput = "Error: Code execution is currently restricted by the administrator.";
                        } else {
                            let output = "";
                            const sandbox = {
                                console: {
                                    log: (...args) => { output += args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ') + '\n'; }
                                }
                            };
                            vm.createContext(sandbox);
                            const result = vm.runInContext(args.code, sandbox, { timeout: 2000 });
                            toolOutput = `Output:\n${output}\nReturn Value: ${result}`;
                        }
                    } catch (e) { toolOutput = `Error Executing Code: ${e.message}`; }
                } else if (functionName === 'searchWeb') {
                    try {
                        const searchUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(args.query)}`;
                        const response = await axios.get(searchUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                        const $ = cheerio.load(response.data);
                        const results = [];
                        $('.result__body').slice(0, 5).each((i, el) => {
                            const title = $(el).find('.result__title').text().trim();
                            const link = $(el).find('.result__a').attr('href');
                            const snippet = $(el).find('.result__snippet').text().trim();
                            results.push(`${i+1}. ${title}\n   Link: ${link}\n   ${snippet}`);
                        });
                        toolOutput = results.length > 0 ? results.join('\n\n') : "No results found.";
                    } catch (e) { toolOutput = `Search Error: ${e.message}`; }
                } else if (functionName === 'browseWeb') {
                    try {
                        const response = await axios.get(args.url, { timeout: 5000, headers: { 'User-Agent': 'Mozilla/5.0' } });
                        const $ = cheerio.load(response.data);
                        $('script, style, nav, footer').remove();
                        const text = $('body').text().replace(/\s+/g, ' ').trim().substring(0, 2000);
                        toolOutput = `Content of ${args.url}:\n\n${text}...`;
                    } catch (e) { toolOutput = `Browsing Error: ${e.message}`; }
                } else if (functionName === 'createSkill') {
                    try {
                        const { getSkills, addSkill } = require('./db');

                        if (!person.IsAdmin) {
                            toolOutput = `Unauthorized: Only Privileged Users are allowed to create skills. Please contact the administrator to grant you access on the dashboard.`;
                        } else {
                            const { skillName, description, content } = args;
                            // Check if skill already exists
                            const existing = await getSkills();
                            if (existing.some(s => s.Name.toLowerCase() === skillName.toLowerCase())) {
                                toolOutput = `A skill named "${skillName}" already exists.`;
                            } else {
                                await addSkill(skillName, description, content);
                                toolOutput = `Skill "${skillName}" created successfully and is awaiting activation in the dashboard.`;
                            }
                        }
                    } catch (e) { toolOutput = `Error creating skill: ${e.message}`; }
                }

                toolMessages.push({
                    role: 'tool',
                    tool_call_id: toolCallId,
                    content: toolOutput
                });
            }

            // Append the assistant's tool calls and the tool results to the history
            aiContextHistory.push(aiResponse);
            aiContextHistory.push(...toolMessages);

            // Get the NEXT response from the AI
            const nextAiResponse = await getAIResponse(null, aiContextHistory);
            aiResponse = nextAiResponse;
        }

        // Final response logic
        const finalContent = aiResponse.content;
        if (finalContent) {
            await sock.sendMessage(from, { text: finalContent });
            if (person) {
                await saveChatMessage(person.Id, 'assistant', finalContent);
                const allTasks = await getTasks();
                const activeUserTasks = allTasks.filter(t => t.PersonId === person.Id && t.Status !== 'Completed');
                if (activeUserTasks.length > 0) {
                    const latestTask = activeUserTasks[activeUserTasks.length - 1];
                    await logTaskActivity(latestTask.Id, 'AI', finalContent);
                }
            }
        }
    } catch (error) {
        console.error('Error processing message:', error);
        await sock.sendMessage(from, { text: "Sorry, I encountered an error processing your request." });
    }
}

module.exports = { processMessage };
