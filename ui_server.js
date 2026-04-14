const express = require('express');
const path = require('path');
const { sessionMiddleware, requireAuth, hashPassword, verifyPassword } = require('./auth');
const { reloadJobs, runJob } = require('./job_manager');

function startUi(getSock, getConnectionInfo, resetConnection) {
    const app = express();
    const port = process.env.PORT || 3000;

    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, 'ui', 'views'));
    app.use(express.urlencoded({ extended: true }));
    app.use(express.json());
    app.use(express.static(path.join(__dirname, 'public')));
    app.use(sessionMiddleware());

    // Global Middleware to inject appSettings into all views
    app.use(async (req, res, next) => {
        try {
            const { getAllSettings } = require('./db');
            res.locals.appSettings = await getAllSettings();
        } catch (err) {
            console.error('Failed to load global appSettings:', err.message);
            res.locals.appSettings = { AppName: 'Follow-up AI', AppLogo: '🚀' };
        }
        next();
    });

    const cronstrue = require('cronstrue');

    // Helper to pass common locals
    const commonLocals = (req) => ({
        connection: getConnectionInfo(),
        currentUser: req.session.user || null,
        cronstrue: cronstrue
    });

    // ─── Auth ──────────────────────────────────────────
    app.get('/login', (req, res) => {
        if (req.session.userId) return res.redirect('/');
        res.render('login', { error: null });
    });

    app.post('/login', async (req, res) => {
        try {
            const { getAppUserByUsername, updateLastLogin } = require('./db');
            const { username, password } = req.body;
            const user = await getAppUserByUsername(username);
            if (!user || !user.IsActive) {
                return res.render('login', { error: 'Invalid username or password.' });
            }
            const valid = await verifyPassword(password, user.PasswordHash);
            if (!valid) {
                return res.render('login', { error: 'Invalid username or password.' });
            }
            req.session.userId = user.Id;
            req.session.user = { id: user.Id, username: user.Username, role: user.Role };
            await updateLastLogin(user.Id);
            res.redirect('/');
        } catch (err) {
            res.render('login', { error: 'Login error: ' + err.message });
        }
    });

    app.get('/logout', (req, res) => {
        req.session.destroy();
        res.redirect('/login');
    });

    // ─── Dashboard ────────────────────────────────────
    app.get('/', requireAuth, async (req, res) => {
        try {
            const { getDashboardStats } = require('./db');
            const stats = await getDashboardStats();
            res.render('dashboard', {
                stats,
                currentPath: '/',
                pageTitle: 'Dashboard',
                ...commonLocals(req)
            });
        } catch (err) { res.status(500).send('Error: ' + err.message); }
    });

    // ─── Tasks ────────────────────────────────────────
    app.get('/tasks', requireAuth, async (req, res) => {
        try {
            const { getTasks, getPeople, getProjects } = require('./db');
            const [tasks, people, projects] = await Promise.all([getTasks(), getPeople(), getProjects()]);
            res.render('tasks', { tasks, people, projects, currentPath: '/tasks', pageTitle: 'Tasks', ...commonLocals(req) });
        } catch (err) { res.status(500).send('Error: ' + err.message); }
    });

    app.post('/add-task', requireAuth, async (req, res) => {
        const { personId, description, dueDate, followUpPersonId, projectId, priority, estimateHours } = req.body;
        try {
            const { addTask } = require('./db');
            const est = estimateHours ? parseFloat(estimateHours) : null;
            await addTask(personId, description, dueDate, followUpPersonId || null, null, projectId, priority, est);
            res.redirect('/tasks');
        } catch (err) { res.status(500).send('Error adding task: ' + err.message); }
    });

    app.post('/update-task', requireAuth, async (req, res) => {
        const { id, personId, description, dueDate, reDueDate, status, followUpPersonId, projectId, priority, estimateHours } = req.body;
        try {
            const { updateTask } = require('./db');
            const est = estimateHours ? parseFloat(estimateHours) : null;
            await updateTask(id, personId, description, dueDate, reDueDate || null, status, null, followUpPersonId || null, null, projectId, priority, est);
            res.redirect('/tasks');
        } catch (err) { res.status(500).send('Error updating task: ' + err.message); }
    });

    app.post('/api/update-task-status', requireAuth, async (req, res) => {
        const { taskId, status } = req.body;
        try {
            const { updateTaskStatus } = require('./db');
            await updateTaskStatus(taskId, status, `Moved to ${status} via Board`);
            res.json({ success: true });
        } catch (err) { res.status(500).json({ success: false, error: err.message }); }
    });

    app.post('/delete-task/:id', requireAuth, async (req, res) => {
        try {
            const { deleteTask } = require('./db');
            await deleteTask(req.params.id);
            res.redirect('/tasks');
        } catch (err) { res.status(500).send('Error deleting task: ' + err.message); }
    });

    // ─── People ───────────────────────────────────────
    app.get('/people', requireAuth, async (req, res) => {
        try {
            const { getPeople } = require('./db');
            const people = await getPeople();
            res.render('people', { people, currentPath: '/people', pageTitle: 'Contacts', ...commonLocals(req) });
        } catch (err) { res.status(500).send('Error: ' + err.message); }
    });

    app.post('/add-person', requireAuth, async (req, res) => {
        const { name, phoneNumber, role, reportsToId, dailyScrumTime } = req.body;
        try {
            const db = require('./db');
            await db.addPerson(name, phoneNumber, role, reportsToId, dailyScrumTime || '10:00');
            res.redirect('/people');
        } catch (err) {
            res.status(500).send("Error adding person: " + err.message);
        }
    });

    app.post('/update-person', requireAuth, async (req, res) => {
        const { id, name, phoneNumber, dailyScrumTime } = req.body;
        try {
            const db = require('./db');
            await db.updatePerson(id, name, phoneNumber, dailyScrumTime || '10:00');
            res.redirect('/people');
        } catch (err) {
            res.status(500).send("Error updating person: " + err.message);
        }
    });

    app.post('/update-person-role', requireAuth, async (req, res) => {
        const { id, role, reportsToId, isAdmin } = req.body;
        try {
            const db = require('./db');
            await db.updatePersonRole(id, role, reportsToId, isAdmin === 'on' ? 1 : 0);
            res.redirect('/people');
        } catch (err) {
            res.status(500).send("Error updating person role: " + err.message);
        }
    });

    app.post('/delete-person/:id', requireAuth, async (req, res) => {
        try {
            const { deletePerson } = require('./db');
            await deletePerson(req.params.id);
            res.redirect('/people');
        } catch (err) { res.status(500).send('Error deleting person: ' + err.message); }
    });

    // ─── Teams ───────────────────────────────────────
    app.get('/teams', requireAuth, async (req, res) => {
        try {
            const { getTeams, getPeople, getTeamMembers } = require('./db');
            const teams = await getTeams();
            const people = await getPeople();
            // Attach members to each team for rendering
            for (let t of teams) {
                t.members = await getTeamMembers(t.Id);
            }
            res.render('teams', { teams, people, currentPath: '/teams', pageTitle: 'Teams & Groups', ...commonLocals(req) });
        } catch (err) { res.status(500).send('Error loading teams: ' + err.message); }
    });

    app.post('/teams/add', requireAuth, async (req, res) => {
        try {
            const { createTeam } = require('./db');
            await createTeam(req.body.name, req.body.description || '');
            res.redirect('/teams');
        } catch (err) { res.status(500).send('Error creating team: ' + err.message); }
    });

    app.post('/teams/member', requireAuth, async (req, res) => {
        try {
            const { addTeamMember, removeTeamMember } = require('./db');
            const { teamId, personId, isLead, action } = req.body;
            if (action === 'remove') {
                await removeTeamMember(teamId, personId);
            } else {
                await addTeamMember(teamId, personId, isLead === '1' || isLead === 'true');
            }
            res.redirect('/teams');
        } catch (err) { res.status(500).send('Error modifying team member: ' + err.message); }
    });

    // ─── Projects ──────────────────────────────────────
    app.get('/projects', requireAuth, async (req, res) => {
        try {
            const { getProjects } = require('./db');
            const projects = await getProjects();
            res.render('projects', { projects, currentPath: '/projects', pageTitle: 'Projects', ...commonLocals(req) });
        } catch (err) { res.status(500).send('Error: ' + err.message); }
    });

    app.post('/projects/add', requireAuth, async (req, res) => {
        const { name, description, color } = req.body;
        try {
            const { addProject } = require('./db');
            await addProject(name, description, color);
            res.redirect('/projects');
        } catch (err) { res.status(500).send('Error adding project: ' + err.message); }
    });

    app.post('/projects/update', requireAuth, async (req, res) => {
        const { id, name, description, color, status } = req.body;
        try {
            const { updateProject } = require('./db');
            await updateProject(id, name, description, color, status);
            res.redirect('/projects');
        } catch (err) { res.status(500).send('Error updating project: ' + err.message); }
    });

    app.post('/projects/delete/:id', requireAuth, async (req, res) => {
        try {
            const { deleteProject } = require('./db');
            await deleteProject(req.params.id);
            res.redirect('/projects');
        } catch (err) { res.status(500).send('Error deleting project: ' + err.message); }
    });

    // ─── Board (Kanban) ────────────────────────────────
    app.get('/kanban', requireAuth, async (req, res) => {
        try {
            const { getTasks, getProjects, getPeople } = require('./db');
            const [tasks, projects, people] = await Promise.all([getTasks(), getProjects(), getPeople()]);
            res.render('kanban', { tasks, projects, people, currentPath: '/kanban', pageTitle: 'Kanban Board', ...commonLocals(req) });
        } catch (err) { res.status(500).send('Error loading board: ' + err.message); }
    });

    // ─── Connection ───────────────────────────────────
    app.get('/connection', requireAuth, (req, res) => {
        res.render('connection', { currentPath: '/connection', pageTitle: 'Connection', ...commonLocals(req) });
    });

    // ─── Privileged Users ─────────────────────────────
    app.get('/privileged', requireAuth, async (req, res) => {
        try {
            const { getPeople } = require('./db');
            const people = await getPeople();
            res.render('privileged', { people, currentPath: '/privileged', pageTitle: 'Privileged Users', ...commonLocals(req) });
        } catch (err) { res.status(500).send('Error: ' + err.message); }
    });

    app.post('/privileged/toggle', requireAuth, async (req, res) => {
        const { personId, isAdmin } = req.body;
        try {
            const { updatePersonRole, getPeople } = require('./db');
            const people = await getPeople();
            const person = people.find(p => p.Id == personId);
            if (person) {
                // isAdmin is a boolean from JSON, so we use it directly
                await updatePersonRole(person.Id, person.Role, person.ReportsToId, isAdmin);
                res.json({ success: true });
            } else {
                res.status(404).json({ success: false, error: 'Person not found' });
            }
        } catch (err) { 
            res.status(500).json({ success: false, error: err.message }); 
        }
    });

    // ─── Settings ─────────────────────────────────────
    app.get('/settings', requireAuth, (req, res) => res.redirect('/settings/general'));

    app.get('/settings/general', requireAuth, async (req, res) => {
        try {
            const { getAllSettings } = require('./db');
            const settings = await getAllSettings();
            res.render('settings', { settings, currentPath: '/settings/general', pageTitle: 'General Settings', ...commonLocals(req) });
        } catch (err) { res.status(500).send('Error loading settings: ' + err.message); }
    });

    app.get('/settings/security', requireAuth, async (req, res) => {
        try {
            const { getAllSettings } = require('./db');
            const settings = await getAllSettings();
            res.render('settings_security', { settings, currentPath: '/settings/security', pageTitle: 'Security & Permissions', ...commonLocals(req) });
        } catch (err) { res.status(500).send('Error loading settings: ' + err.message); }
    });

    app.get('/settings/ai', requireAuth, async (req, res) => {
        try {
            const { getAllSettings } = require('./db');
            const settings = await getAllSettings();
            res.render('settings_ai', { settings, currentPath: '/settings/ai', pageTitle: 'AI Engine Configuration', ...commonLocals(req) });
        } catch (err) { res.status(500).send('Error loading settings: ' + err.message); }
    });

    app.post('/settings/update', requireAuth, async (req, res) => {
        try {
            const { updateSetting, getAllSettings } = require('./db');
            const { reloadJobs } = require('./job_manager');

            const updateIfSet = async (key, val, isCheckbox = false) => {
                if (isCheckbox) {
                    await updateSetting(key, val === 'on' ? 'true' : 'false');
                } else if (val !== undefined) {
                    await updateSetting(key, val.toString());
                }
            };

            // General Settings
            if (req.body._section === 'general') {
                await updateIfSet('EnableScrumReminders', req.body.EnableScrumReminders, true);
                await updateIfSet('ScrumReminderLeadTime', req.body.ScrumReminderLeadTime);
                await updateIfSet('ScrumReplyTimeout', req.body.ScrumReplyTimeout);
                await updateIfSet('DailyScrumTime', req.body.DailyScrumTime);
                await updateIfSet('WeeklyScrumTime', req.body.WeeklyScrumTime);
                await updateIfSet('WeeklyScrumDay', req.body.WeeklyScrumDay);
                await updateIfSet('AppName', req.body.AppName);
                await updateIfSet('AppLogo', req.body.AppLogo);
            }

            // Security Settings
            if (req.body._section === 'security') {
                await updateIfSet('AdminPhone', req.body.AdminPhone);
                await updateIfSet('CodeExecution_AllowExecute', req.body.CodeExecution_AllowExecute, true);
                await updateIfSet('CodeExecution_AllowWrite', req.body.CodeExecution_AllowWrite, true);
                await updateIfSet('CodeExecution_AllowDelete', req.body.CodeExecution_AllowDelete, true);
                await updateIfSet('CodeExecution_AllowEdit', req.body.CodeExecution_AllowEdit, true);
                
                // Legacy
                await updateIfSet('AllowAgentToDelete', req.body.AllowAgentToDelete, true);
                await updateIfSet('AllowAgentToEdit', req.body.AllowAgentToEdit, true);
                await updateIfSet('AllowAgentToWrite', req.body.AllowAgentToWrite, true);
            }

            // AI Configuration
            if (req.body._section === 'ai') {
                await updateIfSet('AI_Provider', req.body.AI_Provider);
                await updateIfSet('OpenAI_ApiKey', req.body.OpenAI_ApiKey);
                await updateIfSet('Gemini_ApiKey', req.body.Gemini_ApiKey);
                await updateIfSet('OpenAI_Model', req.body.OpenAI_Model);
                await updateIfSet('Gemini_Model', req.body.Gemini_Model);
            }

            // Sync scheduled jobs table with these new settings
            const { syncScrumScheduling } = require('./db');
            await syncScrumScheduling();

            // Get updated settings and reload jobs
            const settings = await getAllSettings();
            try {
                await reloadJobs(getSock, getConnectionInfo);
            } catch (e) { console.error('Reload jobs failed:', e.message); }
            
            res.redirect(req.body._redirect || '/settings');
        } catch (err) { res.status(500).send('Error updating settings: ' + err.message); }
    });

    // ─── Skills ───────────────────────────────────────
    app.get('/skills', requireAuth, async (req, res) => {
        try {
            const { getSkills } = require('./db');
            const skills = await getSkills();
            res.render('skills', { skills, currentPath: '/skills', pageTitle: 'Agent Skills', ...commonLocals(req) });
        } catch (err) { res.status(500).send('Error loading skills: ' + err.message); }
    });

    app.post('/skills', requireAuth, async (req, res) => {
        const { name, description, content, isAdminOnly } = req.body;
        try {
            const db = require('./db');
            await db.addSkill(name, description, content, isAdminOnly === 'on' ? 1 : 0);
            res.redirect('/skills');
        } catch (err) {
            res.status(500).send("Error adding skill: " + err.message);
        }
    });

    app.post('/skills/:id', requireAuth, async (req, res) => {
        const { id } = req.params;
        const { name, description, content, isAdminOnly } = req.body;
        try {
            const db = require('./db');
            await db.updateSkill(id, name, description, content, isAdminOnly === 'on' ? 1 : 0);
            res.redirect('/skills');
        } catch (err) {
            res.status(500).send("Error updating skill: " + err.message);
        }
    });

    app.post('/skills/toggle/:id', requireAuth, async (req, res) => {
        const { id } = req.params;
        try {
            const { toggleSkill } = require('./db');
            await toggleSkill(id);
            res.redirect('/skills');
        } catch (err) { res.status(500).send('Error toggling skill: ' + err.message); }
    });

    // ─── Scheduler ────────────────────────────────────
    app.get('/scheduler', requireAuth, async (req, res) => {
        try {
            const { getScheduledJobs } = require('./db');
            const jobs = await getScheduledJobs();
            res.render('scheduler', { jobs, currentPath: '/scheduler', pageTitle: 'Scheduler', ...commonLocals(req) });
        } catch (err) { res.status(500).send('Error: ' + err.message); }
    });

    app.post('/scheduler/update/:id', requireAuth, async (req, res) => {
        const { name, cronExpression, jobType } = req.body;
        try {
            const { updateScheduledJob } = require('./db');
            await updateScheduledJob(req.params.id, name, cronExpression, jobType);
            await reloadJobs(getSock, getConnectionInfo);
            res.redirect('/scheduler');
        } catch (err) { res.status(500).send('Error updating job: ' + err.message); }
    });

    app.post('/scheduler/add', requireAuth, async (req, res) => {
        const { name, cronExpression, jobType } = req.body;
        try {
            const { addScheduledJob } = require('./db');
            await addScheduledJob(name, cronExpression, jobType);
            await reloadJobs(getSock, getConnectionInfo);
            res.redirect('/scheduler');
        } catch (err) { res.status(500).send('Error: ' + err.message); }
    });

    app.post('/scheduler/toggle/:id', requireAuth, async (req, res) => {
        try {
            const { toggleScheduledJob, getScheduledJobs } = require('./db');
            const jobs = await getScheduledJobs();
            const job = jobs.find(j => j.Id == req.params.id);
            if (job) {
                await toggleScheduledJob(job.Id, !job.IsEnabled);
                await reloadJobs(getSock, getConnectionInfo);
            }
            res.redirect('/scheduler');
        } catch (err) { res.status(500).send('Error: ' + err.message); }
    });

    app.post('/scheduler/delete/:id', requireAuth, async (req, res) => {
        try {
            const { deleteScheduledJob } = require('./db');
            await deleteScheduledJob(req.params.id);
            await reloadJobs(getSock, getConnectionInfo);
            res.redirect('/scheduler');
        } catch (err) { res.status(500).send('Error: ' + err.message); }
    });

    app.post('/scheduler/run/:id', requireAuth, async (req, res) => {
        try {
            const { getScheduledJobs, updateJobLastRun } = require('./db');
            const jobs = await getScheduledJobs();
            const job = jobs.find(j => j.Id == req.params.id);
            if (job) {
                await runJob(job.JobType, getSock, getConnectionInfo);
                await updateJobLastRun(job.Id);
            }
            res.redirect('/scheduler');
        } catch (err) { res.status(500).send('Error: ' + err.message); }
    });

    // ─── Boss ─────────────────────────────────────────
    app.get('/boss', requireAuth, async (req, res) => {
        try {
            const { getBossReports, getBoss, getPeople } = require('./db');
            const [reports, boss, people] = await Promise.all([getBossReports(), getBoss(), getPeople()]);
            res.render('boss', { reports, boss, people, currentPath: '/boss', pageTitle: 'Boss Report', ...commonLocals(req) });
        } catch (err) { res.status(500).send('Error: ' + err.message); }
    });

    app.post('/boss/send-report', requireAuth, async (req, res) => {
        try {
            const { sendBossReport } = require('./boss');
            await sendBossReport(getSock, getConnectionInfo, 'manual');
            res.redirect('/boss');
        } catch (err) { res.status(500).send('Error: ' + err.message); }
    });

    // ─── Users ────────────────────────────────────────
    app.get('/users', requireAuth, async (req, res) => {
        try {
            const { getAppUsers } = require('./db');
            const users = await getAppUsers();
            res.render('users', { users, currentPath: '/users', pageTitle: 'User Management', ...commonLocals(req) });
        } catch (err) { res.status(500).send('Error: ' + err.message); }
    });

    app.post('/users/add', requireAuth, async (req, res) => {
        const { username, password, role } = req.body;
        try {
            const { addAppUser } = require('./db');
            const hash = await hashPassword(password);
            await addAppUser(username, hash, role || 'admin');
            res.redirect('/users');
        } catch (err) { res.status(500).send('Error adding user: ' + err.message); }
    });

    app.post('/users/toggle/:id', requireAuth, async (req, res) => {
        try {
            const { toggleAppUser, getAppUserById } = require('./db');
            const user = await getAppUserById(req.params.id);
            if (user) await toggleAppUser(user.Id, !user.IsActive);
            res.redirect('/users');
        } catch (err) { res.status(500).send('Error: ' + err.message); }
    });

    // ─── API (not auth-protected) ─────────────────────
    app.get('/api/connection', (req, res) => res.json(getConnectionInfo()));

    app.post('/api/connection/reset', async (req, res) => {
        try { await resetConnection(); res.json({ success: true }); }
        catch (err) { res.status(500).json({ error: err.message }); }
    });

    app.get('/api/tasks/:id/activity', async (req, res) => {
        try {
            const { getTaskActivity } = require('./db');
            res.json(await getTaskActivity(req.params.id));
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // ─── Legacy action routes ─────────────────────────
    app.post('/run-reminders', requireAuth, async (req, res) => {
        try {
            const { sendReminders } = require('./scheduler_helpers');
            await sendReminders(getSock, getConnectionInfo);
            res.redirect('/tasks');
        } catch (err) { res.status(500).send('Error: ' + err.message); }
    });

    app.post('/run-scrum', requireAuth, async (req, res) => {
        try {
            const sock = getSock();
            const conn = getConnectionInfo();
            if (!sock || conn.status !== 'CONNECTED') throw new Error('WhatsApp not connected');
            const { getPeople } = require('./db');
            const { startScrumForPerson } = require('./scrum');
            const people = await getPeople();
            for (const person of people) {
                if (person.Role === 'Boss') continue;
                await startScrumForPerson(sock, person.Id, person.Name, person.PhoneNumber);
            }
            res.redirect('/tasks');
        } catch (err) { res.status(500).send('Error: ' + err.message); }
    });

    app.post('/people/run-scrum/:id', requireAuth, async (req, res) => {
        try {
            const { getPeople } = require('./db');
            const { startScrumForPerson } = require('./scrum');
            const personId = parseInt(req.params.id);
            const people = await getPeople();
            const person = people.find(p => p.Id === personId);
            const sock = getSock();
            const conn = getConnectionInfo();
            if (!sock || conn.status !== 'CONNECTED') throw new Error('WhatsApp not connected');
            if (person) {
                await startScrumForPerson(sock, person.Id, person.Name, person.PhoneNumber);
            }
            res.redirect('/people');
        } catch (err) { res.status(500).send('Error: ' + err.message); }
    });

    app.post('/people/run-weekly-scrum/:id', requireAuth, async (req, res) => {
        try {
            const { getPeople } = require('./db');
            const { startWeeklyScrumForPerson } = require('./scrum');
            const personId = parseInt(req.params.id);
            const people = await getPeople();
            const person = people.find(p => p.Id === personId);
            const sock = getSock();
            const conn = getConnectionInfo();
            if (!sock || conn.status !== 'CONNECTED') throw new Error('WhatsApp not connected');
            if (person) {
                await startWeeklyScrumForPerson(sock, person.Id, person.Name, person.PhoneNumber);
            }
            res.redirect('/people');
        } catch (err) { res.status(500).send('Error: ' + err.message); }
    });

    app.listen(port, () => console.log(`UI running at http://localhost:${port}`));
}

module.exports = { startUi };
