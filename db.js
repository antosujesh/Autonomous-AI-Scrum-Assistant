const sql = require('mssql');

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    options: {
        encrypt: false, // Set to true for Azure, false for local dev
        trustServerCertificate: true, // Self-signed certs
        instanceName: 'SQLEXPRESS'
    }
};

const poolPromise = new sql.ConnectionPool(config)
    .connect()
    .then(pool => {
        console.log('Connected to MSSQL Server successfully!');
        return pool;
    })
    .catch(err => {
        console.error('Database Connection Failed! Bad Config: ', err);
        throw err;
    });

async function initDb() {
    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);
    try {
        await transaction.begin();
        
        await transaction.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Projects')
            BEGIN
                CREATE TABLE Projects (
                    Id INT PRIMARY KEY IDENTITY(1,1),
                    Name NVARCHAR(100) NOT NULL,
                    Description NVARCHAR(MAX),
                    Color NVARCHAR(20) DEFAULT '#4f46e5',
                    Status NVARCHAR(50) DEFAULT 'Active',
                    CreatedAt DATETIME DEFAULT GETDATE()
                );
                -- Seed default project
                INSERT INTO Projects (Name, Description, Color) VALUES ('General', 'Default project for all tasks', '#4f46e5');
            END
        `);

        await transaction.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'People')
            BEGIN
                CREATE TABLE People (
                    Id INT PRIMARY KEY IDENTITY(1,1),
                    Name NVARCHAR(100) NOT NULL,
                    PhoneNumber NVARCHAR(20) NOT NULL UNIQUE,
                    WhatsAppId NVARCHAR(100)
                );
            END
            ELSE
            BEGIN
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('People') AND name = 'WhatsAppId')
                BEGIN
                    ALTER TABLE People ADD WhatsAppId NVARCHAR(100);
                END
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('People') AND name = 'Role')
                BEGIN
                    ALTER TABLE People ADD Role NVARCHAR(20) DEFAULT 'Member';
                END
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('People') AND name = 'ReportsToId')
                BEGIN
                    ALTER TABLE People ADD ReportsToId INT NULL;
                END
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('People') AND name = 'DailyScrumTime')
                BEGIN
                    ALTER TABLE People ADD DailyScrumTime NVARCHAR(10) DEFAULT '10:00';
                END
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('People') AND name = 'IsAdmin')
                BEGIN
                    ALTER TABLE People ADD IsAdmin BIT DEFAULT 0;
                END
            END
        `);

        await transaction.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Tasks')
            BEGIN
                CREATE TABLE Tasks (
                    Id INT PRIMARY KEY IDENTITY(1,1),
                    PersonId INT NOT NULL FOREIGN KEY REFERENCES People(Id),
                    Description NVARCHAR(MAX) NOT NULL,
                    DueDate DATETIME NOT NULL,
                    Status NVARCHAR(50) DEFAULT 'Pending',
                    CreatedAt DATETIME DEFAULT GETDATE(),
                    LastReminderSentAt DATETIME,
                    Remarks NVARCHAR(MAX),
                    ReDueDate DATETIME,
                    AIUpdate NVARCHAR(MAX),
                    FollowUpPersonId INT NULL FOREIGN KEY REFERENCES People(Id),
                    RescheduleCount INT DEFAULT 0
                );
            END
            ELSE
            BEGIN
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Tasks') AND name = 'Remarks')
                BEGIN
                    ALTER TABLE Tasks ADD Remarks NVARCHAR(MAX);
                END
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Tasks') AND name = 'ReDueDate')
                BEGIN
                    ALTER TABLE Tasks ADD ReDueDate DATETIME;
                END
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Tasks') AND name = 'AIUpdate')
                BEGIN
                    ALTER TABLE Tasks ADD AIUpdate NVARCHAR(MAX);
                END
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Tasks') AND name = 'FollowUpPersonId')
                BEGIN
                    ALTER TABLE Tasks ADD FollowUpPersonId INT NULL FOREIGN KEY REFERENCES People(Id);
                END
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Tasks') AND name = 'ParentTaskId')
                BEGIN
                    ALTER TABLE Tasks ADD ParentTaskId INT NULL FOREIGN KEY REFERENCES Tasks(Id);
                END
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Tasks') AND name = 'RescheduleCount')
                BEGIN
                    ALTER TABLE Tasks ADD RescheduleCount INT DEFAULT 0;
                END
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Tasks') AND name = 'ProjectId')
                BEGIN
                    ALTER TABLE Tasks ADD ProjectId INT NULL FOREIGN KEY REFERENCES Projects(Id);
                    -- Assign existing tasks to the 'General' project (Id: 1)
                    EXEC('UPDATE Tasks SET ProjectId = 1 WHERE ProjectId IS NULL');
                END
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Tasks') AND name = 'Priority')
                BEGIN
                    ALTER TABLE Tasks ADD Priority INT DEFAULT 2; -- 1: Low, 2: Medium, 3: High, 4: Urgent
                END
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Tasks') AND name = 'EstimateHours')
                BEGIN
                    ALTER TABLE Tasks ADD EstimateHours FLOAT NULL;
                END
            END
        `);

        await transaction.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ScrumSessions')
            BEGIN
                CREATE TABLE ScrumSessions (
                    PersonId INT PRIMARY KEY FOREIGN KEY REFERENCES People(Id),
                    TaskIds NVARCHAR(MAX) NOT NULL,
                    CurrentTaskIndex INT DEFAULT 0,
                    IsActive BIT DEFAULT 1,
                    Type NVARCHAR(20) DEFAULT 'Daily',
                    LastUpdate DATETIME DEFAULT GETDATE()
                );
            END
            ELSE
            BEGIN
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('ScrumSessions') AND name = 'Type')
                BEGIN
                    ALTER TABLE ScrumSessions ADD Type NVARCHAR(20) DEFAULT 'Daily';
                END
            END
        `);

        await transaction.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'TaskActivityLog')
            BEGIN
                CREATE TABLE TaskActivityLog (
                    Id INT PRIMARY KEY IDENTITY(1,1),
                    TaskId INT NOT NULL FOREIGN KEY REFERENCES Tasks(Id),
                    MessageType NVARCHAR(50) NOT NULL,
                    MessageText NVARCHAR(MAX) NOT NULL,
                    CreatedAt DATETIME DEFAULT GETDATE()
                );
            END
        `);

        // WhatsAppChatHistory table
        await transaction.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'WhatsAppChatHistory')
            BEGIN
                CREATE TABLE WhatsAppChatHistory (
                    Id INT PRIMARY KEY IDENTITY(1,1),
                    PersonId INT NOT NULL FOREIGN KEY REFERENCES People(Id),
                    Role NVARCHAR(50) NOT NULL,
                    Content NVARCHAR(MAX) NOT NULL,
                    CreatedAt DATETIME DEFAULT GETDATE()
                );
            END
        `);

        // ScheduledJobs table
        await transaction.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ScheduledJobs')
            BEGIN
                CREATE TABLE ScheduledJobs (
                    Id INT PRIMARY KEY IDENTITY(1,1),
                    Name NVARCHAR(100) NOT NULL,
                    CronExpression NVARCHAR(50) NOT NULL,
                    JobType NVARCHAR(50) NOT NULL,
                    IsEnabled BIT DEFAULT 1,
                    LastRunAt DATETIME,
                    CreatedAt DATETIME DEFAULT GETDATE()
                );
                -- Seed default jobs
                INSERT INTO ScheduledJobs (Name, CronExpression, JobType, IsEnabled)
                VALUES
                    ('Daily Overdue Reminders', '0 9 * * *',   'reminders',   1),
                    ('Daily Scrum Trigger',     '* * * * 1-6', 'scrum',        1),
                    ('Boss Daily Report',      '0 17 * * 1-6','boss_report',  0);
            END
        `);

        // BossReports table
        await transaction.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'BossReports')
            BEGIN
                CREATE TABLE BossReports (
                    Id INT PRIMARY KEY IDENTITY(1,1),
                    ReportText NVARCHAR(MAX),
                    TriggeredBy NVARCHAR(50),
                    SentAt DATETIME DEFAULT GETDATE()
                );
            END
        `);

        // Teams and TeamMembers tables
        await transaction.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Teams')
            BEGIN
                CREATE TABLE Teams (
                    Id INT PRIMARY KEY IDENTITY(1,1),
                    Name NVARCHAR(100) NOT NULL,
                    Description NVARCHAR(255)
                );
            END
        `);
        await transaction.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'TeamMembers')
            BEGIN
                CREATE TABLE TeamMembers (
                    TeamId INT NOT NULL FOREIGN KEY REFERENCES Teams(Id),
                    PersonId INT NOT NULL FOREIGN KEY REFERENCES People(Id),
                    IsLead BIT DEFAULT 0,
                    PRIMARY KEY (TeamId, PersonId)
                );
            END
        `);

        // AppUserSettings table (previously AppUsers)
        await transaction.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'AppUsers')
            BEGIN
                CREATE TABLE AppUsers (
                    Id INT PRIMARY KEY IDENTITY(1,1),
                    Username NVARCHAR(50) UNIQUE NOT NULL,
                    PasswordHash NVARCHAR(255) NOT NULL,
                    Role NVARCHAR(20) DEFAULT 'admin',
                    IsActive BIT DEFAULT 1,
                    CreatedAt DATETIME DEFAULT GETDATE(),
                    LastLoginAt DATETIME
                );
            END
        `);

        // AppSettings table
        await transaction.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'AppSettings')
            BEGIN
                CREATE TABLE AppSettings (
                    SettingKey NVARCHAR(100) PRIMARY KEY,
                    SettingValue NVARCHAR(MAX) NOT NULL
                );
                -- Seed default values
                IF NOT EXISTS (SELECT 1 FROM AppSettings WHERE SettingKey = 'EnableScrumReminders')
                    INSERT INTO AppSettings (SettingKey, SettingValue) VALUES ('EnableScrumReminders', 'true');
                IF NOT EXISTS (SELECT 1 FROM AppSettings WHERE SettingKey = 'ScrumReminderLeadTime')
                    INSERT INTO AppSettings (SettingKey, SettingValue) VALUES ('ScrumReminderLeadTime', '30');
                IF NOT EXISTS (SELECT 1 FROM AppSettings WHERE SettingKey = 'AppName')
                    INSERT INTO AppSettings (SettingKey, SettingValue) VALUES ('AppName', 'Follow-up AI');
                IF NOT EXISTS (SELECT 1 FROM AppSettings WHERE SettingKey = 'AppLogo')
                    INSERT INTO AppSettings (SettingKey, SettingValue) VALUES ('AppLogo', '🚀');
                IF NOT EXISTS (SELECT 1 FROM AppSettings WHERE SettingKey = 'ScrumReplyTimeout')
                    INSERT INTO AppSettings (SettingKey, SettingValue) VALUES ('ScrumReplyTimeout', '10');
                IF NOT EXISTS (SELECT 1 FROM AppSettings WHERE SettingKey = 'DailyScrumTime')
                    INSERT INTO AppSettings (SettingKey, SettingValue) VALUES ('DailyScrumTime', '10:00');
                IF NOT EXISTS (SELECT 1 FROM AppSettings WHERE SettingKey = 'WeeklyScrumTime')
                    INSERT INTO AppSettings (SettingKey, SettingValue) VALUES ('WeeklyScrumTime', '17:00');
                IF NOT EXISTS (SELECT 1 FROM AppSettings WHERE SettingKey = 'WeeklyScrumDay')
                    INSERT INTO AppSettings (SettingKey, SettingValue) VALUES ('WeeklyScrumDay', '6');
                IF NOT EXISTS (SELECT 1 FROM AppSettings WHERE SettingKey = 'AllowAgentToDelete')
                    INSERT INTO AppSettings (SettingKey, SettingValue) VALUES ('AllowAgentToDelete', 'false');
                IF NOT EXISTS (SELECT 1 FROM AppSettings WHERE SettingKey = 'AllowAgentToEdit')
                    INSERT INTO AppSettings (SettingKey, SettingValue) VALUES ('AllowAgentToEdit', 'false');
                IF NOT EXISTS (SELECT 1 FROM AppSettings WHERE SettingKey = 'AllowAgentToWrite')
                    INSERT INTO AppSettings (SettingKey, SettingValue) VALUES ('AllowAgentToWrite', 'false');
                IF NOT EXISTS (SELECT 1 FROM AppSettings WHERE SettingKey = 'AllowAgentToViewEvents')
                    INSERT INTO AppSettings (SettingKey, SettingValue) VALUES ('AllowAgentToViewEvents', 'false');
                IF NOT EXISTS (SELECT 1 FROM AppSettings WHERE SettingKey = 'AdminPhone')
                    INSERT INTO AppSettings (SettingKey, SettingValue) VALUES ('AdminPhone', '');
                IF NOT EXISTS (SELECT 1 FROM AppSettings WHERE SettingKey = 'CodeExecution_AllowExecute')
                    INSERT INTO AppSettings (SettingKey, SettingValue) VALUES ('CodeExecution_AllowExecute', 'false');
                IF NOT EXISTS (SELECT 1 FROM AppSettings WHERE SettingKey = 'CodeExecution_AllowWrite')
                    INSERT INTO AppSettings (SettingKey, SettingValue) VALUES ('CodeExecution_AllowWrite', 'false');
                IF NOT EXISTS (SELECT 1 FROM AppSettings WHERE SettingKey = 'CodeExecution_AllowDelete')
                    INSERT INTO AppSettings (SettingKey, SettingValue) VALUES ('CodeExecution_AllowDelete', 'false');
                IF NOT EXISTS (SELECT 1 FROM AppSettings WHERE SettingKey = 'CodeExecution_AllowEdit')
                    INSERT INTO AppSettings (SettingKey, SettingValue) VALUES ('CodeExecution_AllowEdit', 'false');
                IF NOT EXISTS (SELECT 1 FROM AppSettings WHERE SettingKey = 'AI_Provider')
                    INSERT INTO AppSettings (SettingKey, SettingValue) VALUES ('AI_Provider', 'OpenAI');
                IF NOT EXISTS (SELECT 1 FROM AppSettings WHERE SettingKey = 'OpenAI_ApiKey')
                    INSERT INTO AppSettings (SettingKey, SettingValue) VALUES ('OpenAI_ApiKey', '<%= process.env.OPENAI_API_KEY || "" %>');
                IF NOT EXISTS (SELECT 1 FROM AppSettings WHERE SettingKey = 'Gemini_ApiKey')
                    INSERT INTO AppSettings (SettingKey, SettingValue) VALUES ('Gemini_ApiKey', '');
                IF NOT EXISTS (SELECT 1 FROM AppSettings WHERE SettingKey = 'OpenAI_Model')
                    INSERT INTO AppSettings (SettingKey, SettingValue) VALUES ('OpenAI_Model', 'gpt-4o');
                IF NOT EXISTS (SELECT 1 FROM AppSettings WHERE SettingKey = 'Gemini_Model')
                    INSERT INTO AppSettings (SettingKey, SettingValue) VALUES ('Gemini_Model', 'gemini-1.5-flash');
            END
        `);

        // Skills table
        await transaction.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Skills')
            BEGIN
                CREATE TABLE Skills (
                    Id INT PRIMARY KEY IDENTITY(1,1),
                    Name NVARCHAR(100) NOT NULL,
                    Description NVARCHAR(255),
                    Content NVARCHAR(MAX) NOT NULL,
                    IsEnabled BIT DEFAULT 1,
                    IsAdminOnly BIT DEFAULT 0,
                    CreatedAt DATETIME DEFAULT GETDATE(),
                    UpdatedAt DATETIME DEFAULT GETDATE()
                );
            END
            ELSE
            BEGIN
                IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Skills') AND name = 'IsAdminOnly')
                BEGIN
                    ALTER TABLE Skills ADD IsAdminOnly BIT DEFAULT 0;
                END
            END
        `);

        // Seed default skills
        await seedDefaultSkills(transaction);

        await transaction.commit();
        console.log('Database Schema initialized.');

        // Seed default admin user if no users exist
        await seedDefaultAdmin();

    } catch (err) {
        if (transaction._aborted === false) await transaction.rollback();
        console.error('Schema initialization failed:', err);
    }
}

async function seedDefaultSkills(transaction) {
    const skills = [
        {
            name: 'Web Browser',
            desc: 'Allows the AI to fetch and read content from a specific URL.',
            content: 'Use the "browseWeb" tool to fetch content from any direct link provided by the user. Summarize the key information for them.'
        },
        {
            name: 'Search Engine',
            desc: 'Allows the AI to search Google/Bing for real-time information.',
            content: 'Use the "searchWeb" tool when you need current events, news, or general information that requires a web search.'
        },
        {
            name: 'Code Executor',
            desc: 'Allows the AI to run JavaScript code to solve complex problems.',
            content: 'Use the "executeCode" tool for mathematical calculations, data processing, or any logic that is better handled by a script.'
        },
        {
            name: 'Watchdog',
            desc: 'Monitors stalling behavior and report delays to managers.',
            content: '- Monitor history for "Delaying Patterns" (RescheduleCount >= 3 or ignores messages).\n- Pattern 1: If detected, issue a firm warning about task velocity.\n- Pattern 2: If behavior continues, use "sendMessage" to notify the Reporting Manager (Name and Phone provided in your system context).\n- Report Content: "ALERT: [User] is repeatedly stalling on Task [ID]. Minimal response and [X] reschedules detected."'
        }
    ];

    for (const skill of skills) {
        await transaction.request()
            .input('name', sql.NVarChar, skill.name)
            .input('desc', sql.NVarChar, skill.desc)
            .input('content', sql.NVarChar, skill.content)
            .query(`
                IF NOT EXISTS (SELECT 1 FROM Skills WHERE Name = @name)
                    INSERT INTO Skills (Name, Description, Content, IsEnabled)
                    VALUES (@name, @desc, @content, 1)
            `);
    }
}

async function seedDefaultAdmin() {
    const bcrypt = require('bcrypt');
    const pool = await poolPromise;
    const existing = await pool.request().query(`SELECT COUNT(*) as cnt FROM AppUsers`);
    if (existing.recordset[0].cnt === 0) {
        const hash = await bcrypt.hash('admin123', 10);
        await pool.request()
            .input('hash', sql.NVarChar, hash)
            .query(`INSERT INTO AppUsers (Username, PasswordHash, Role) VALUES ('admin', @hash, 'admin')`);
        console.log('[Auth] Default admin user created: admin / admin123');
    }
}

async function getPeople() {
    const pool = await poolPromise;
    const result = await pool.request().query('SELECT * FROM People ORDER BY Name');
    return result.recordset;
}

async function addPerson(name, phoneNumber, role = 'Member', reportsToId = null, dailyScrumTime = '10:00') {
    const pool = await poolPromise;
    await pool.request()
        .input('name', sql.NVarChar, name)
        .input('phone', sql.NVarChar, phoneNumber)
        .input('role', sql.NVarChar, role)
        .input('reportsTo', sql.Int, reportsToId)
        .input('scrumTime', sql.NVarChar, dailyScrumTime)
        .query('INSERT INTO People (Name, PhoneNumber, Role, ReportsToId, DailyScrumTime) VALUES (@name, @phone, @role, @reportsTo, @scrumTime)');
}

async function updatePerson(id, name, phoneNumber, dailyScrumTime) {
    const pool = await poolPromise;
    await pool.request()
        .input('id', sql.Int, id)
        .input('name', sql.NVarChar, name)
        .input('phone', sql.NVarChar, phoneNumber)
        .input('scrumTime', sql.NVarChar, dailyScrumTime)
        .query('UPDATE People SET Name = @name, PhoneNumber = @phone, DailyScrumTime = @scrumTime WHERE Id = @id');
}

async function updatePersonRole(id, role, reportsToId, isAdmin) {
    const pool = await poolPromise;
    await pool.request()
        .input('id', sql.Int, id)
        .input('role', sql.NVarChar, role)
        .input('reportsTo', sql.Int, reportsToId)
        .input('isAdmin', sql.Bit, isAdmin ? 1 : 0)
        .query('UPDATE People SET Role = @role, ReportsToId = @reportsTo, IsAdmin = @isAdmin WHERE Id = @id');
}

async function getTasks() {
    const pool = await poolPromise;
    const result = await pool.request().query(`
        SELECT t.*, 
               p.Name as PersonName, p.PhoneNumber,
               f.Name as FollowUpPersonName, f.PhoneNumber as FollowUpPhoneNumber, f.WhatsAppId as FollowUpWhatsAppId
        FROM Tasks t 
        JOIN People p ON t.PersonId = p.Id
        LEFT JOIN People f ON t.FollowUpPersonId = f.Id
        ORDER BY t.DueDate ASC
    `);
    return result.recordset;
}

async function addTask(personId, description, dueDate, followUpPersonId = null, parentTaskId = null, projectId = 1, priority = 2, estimateHours = null) {
    const pool = await poolPromise;
    await pool.request()
        .input('personId', sql.Int, personId)
        .input('description', sql.NVarChar, description)
        .input('dueDate', sql.DateTime, new Date(dueDate))
        .input('followUpPersonId', sql.Int, followUpPersonId)
        .input('parentTaskId', sql.Int, parentTaskId)
        .input('projectId', sql.Int, projectId || 1)
        .input('priority', sql.Int, priority || 2)
        .input('estimate', sql.Float, estimateHours)
        .query('INSERT INTO Tasks (PersonId, Description, DueDate, FollowUpPersonId, ParentTaskId, ProjectId, Priority, EstimateHours) VALUES (@personId, @description, @dueDate, @followUpPersonId, @parentTaskId, @projectId, @priority, @estimate)');
}

async function updateTaskStatus(taskId, status, comment = null, reDueDate = null, aiUpdate = null) {
    const pool = await poolPromise;
    let query = 'UPDATE Tasks SET Status = @status';
    const request = pool.request().input('id', sql.Int, taskId).input('status', sql.NVarChar, status);

    if (comment) {
        const timestamp = new Date().toLocaleString();
        query += ', Remarks = COALESCE(Remarks, \'\') + \'[\' + @timestamp + \'] \' + @comment + CHAR(13) + CHAR(10)';
        request.input('comment', sql.NVarChar, comment).input('timestamp', sql.NVarChar, timestamp);
    }

    if (reDueDate) {
        query += ', ReDueDate = @reDueDate, RescheduleCount = ISNULL(RescheduleCount, 0) + 1';
        request.input('reDueDate', sql.DateTime, new Date(reDueDate));
    }

    if (aiUpdate) {
        const timestamp = new Date().toLocaleString();
        query += ', AIUpdate = COALESCE(AIUpdate, \'\') + \'[\' + @timestamp + \'] \' + @aiUpdate + CHAR(13) + CHAR(10)';
        request.input('aiUpdate', sql.NVarChar, aiUpdate);
    }

    query += ' WHERE Id = @id';
    await request.query(query);
}

async function updateTask(id, personId, description, dueDate, reDueDate, status, aiUpdate = null, followUpPersonId = null, parentTaskId = null, projectId = 1, priority = 2, estimateHours = null) {
    const pool = await poolPromise;
    let query = `
        UPDATE Tasks SET 
            PersonId = @pid, 
            Description = @desc, 
            DueDate = @dueDate, 
            ReDueDate = @reDueDate, 
            Status = @status,
            FollowUpPersonId = @followUpPersonId,
            ParentTaskId = @parentTaskId,
            ProjectId = @projectId,
            Priority = @priority,
            EstimateHours = @estimate
    `;
    const request = pool.request()
        .input('id', sql.Int, id)
        .input('pid', sql.Int, personId)
        .input('desc', sql.NVarChar, description)
        .input('dueDate', sql.DateTime, new Date(dueDate))
        .input('reDueDate', reDueDate ? new Date(reDueDate) : null)
        .input('status', sql.NVarChar, status)
        .input('followUpPersonId', sql.Int, followUpPersonId)
        .input('parentTaskId', sql.Int, parentTaskId)
        .input('projectId', sql.Int, projectId || 1)
        .input('priority', sql.Int, priority || 2)
        .input('estimate', sql.Float, estimateHours);

    if (aiUpdate) {
        const timestamp = new Date().toLocaleString();
        query += ', AIUpdate = COALESCE(AIUpdate, \'\') + \'[\' + @timestamp + \'] \' + @aiUpdate + CHAR(13) + CHAR(10)';
        request.input('aiUpdate', sql.NVarChar, aiUpdate);
    }

    query += ' WHERE Id = @id';
    await request.query(query);
}

async function updateTaskRemarks(taskId, newRemark) {
    const pool = await poolPromise;
    const timestamp = new Date().toLocaleString();
    await pool.request()
        .input('id', sql.Int, taskId)
        .input('remark', sql.NVarChar, newRemark)
        .input('timestamp', sql.NVarChar, timestamp)
        .query(`
            UPDATE Tasks 
            SET Remarks = COALESCE(Remarks, '') + '[' + @timestamp + '] ' + @remark + CHAR(13) + CHAR(10)
            WHERE Id = @id
        `);
}

async function getOverdueTasks() {
    const pool = await poolPromise;
    const result = await pool.request().query(`
        SELECT t.*, 
               p.Name as PersonName, p.PhoneNumber,
               f.Name as FollowUpPersonName, f.PhoneNumber as FollowUpPhoneNumber, f.WhatsAppId as FollowUpWhatsAppId
        FROM Tasks t 
        JOIN People p ON t.PersonId = p.Id
        LEFT JOIN People f ON t.FollowUpPersonId = f.Id
        WHERE t.Status != 'Completed' AND (t.ReDueDate < GETDATE() OR (t.ReDueDate IS NULL AND t.DueDate < GETDATE()))
    `);
    return result.recordset;
}

async function markReminderSent(taskId) {
    const pool = await poolPromise;
    await pool.request()
        .input('id', sql.Int, taskId)
        .query('UPDATE Tasks SET LastReminderSentAt = GETDATE() WHERE Id = @id');
}

async function getTasksToRemindNow() {
    const pool = await poolPromise;
    // Find active tasks due in the past/present that haven't been reminded for their current deadline
    const result = await pool.request().query(`
        SELECT t.*, 
               p.Name as PersonName, p.PhoneNumber,
               f.Name as FollowUpPersonName, f.PhoneNumber as FollowUpPhoneNumber, f.WhatsAppId as FollowUpWhatsAppId
        FROM Tasks t 
        JOIN People p ON t.PersonId = p.Id
        LEFT JOIN People f ON t.FollowUpPersonId = f.Id
        WHERE t.Status != 'Completed' 
        AND ISNULL(t.ReDueDate, t.DueDate) <= GETDATE()
        AND (t.LastReminderSentAt IS NULL OR t.LastReminderSentAt < ISNULL(t.ReDueDate, t.DueDate))
    `);
    return result.recordset;
}

// Scrum Session Helpers
async function getActiveScrumSession(personId) {
    const pool = await poolPromise;
    const result = await pool.request()
        .input('pid', sql.Int, personId)
        .query('SELECT * FROM ScrumSessions WHERE PersonId = @pid AND IsActive = 1');
    return result.recordset[0];
}

async function startScrumSession(personId, taskIds, type = 'Daily') {
    const pool = await poolPromise;
    await pool.request()
        .input('pid', sql.Int, personId)
        .input('tids', sql.NVarChar, JSON.stringify(taskIds))
        .input('type', sql.NVarChar, type)
        .query(`
            IF EXISTS (SELECT 1 FROM ScrumSessions WHERE PersonId = @pid)
                UPDATE ScrumSessions SET TaskIds = @tids, CurrentTaskIndex = 0, IsActive = 1, Type = @type, LastUpdate = GETDATE() WHERE PersonId = @pid
            ELSE
                INSERT INTO ScrumSessions (PersonId, TaskIds, CurrentTaskIndex, IsActive, Type) VALUES (@pid, @tids, 0, 1, @type)
        `);
}

async function advanceScrumSession(personId) {
    const pool = await poolPromise;
    await pool.request()
        .input('pid', sql.Int, personId)
        .query('UPDATE ScrumSessions SET CurrentTaskIndex = CurrentTaskIndex + 1, LastUpdate = GETDATE() WHERE PersonId = @pid');
}

async function endScrumSession(personId) {
    const pool = await poolPromise;
    await pool.request()
        .input('pid', sql.Int, personId)
        .query('UPDATE ScrumSessions SET IsActive = 0 WHERE PersonId = @pid');
}

async function refreshScrumSessionTime(personId) {
    const pool = await poolPromise;
    await pool.request()
        .input('pid', sql.Int, personId)
        .query('UPDATE ScrumSessions SET LastUpdate = GETDATE() WHERE PersonId = @pid');
}

async function getExpiredScrumSessions(timeoutMinutes, referenceTime) {
    const pool = await poolPromise;
    const result = await pool.request()
        .input('timeout', sql.Int, timeoutMinutes)
        .input('now', sql.DateTime, referenceTime || new Date())
        .query(`
            SELECT s.*, p.Name as PersonName, p.PhoneNumber 
            FROM ScrumSessions s
            JOIN People p ON s.PersonId = p.Id
            WHERE s.IsActive = 1 
            AND DATEDIFF(minute, s.LastUpdate, @now) >= @timeout
        `);
    return result.recordset;
}

async function getTasksForWeek(personId) {
    const pool = await poolPromise;
    const result = await pool.request()
        .input('pid', sql.Int, personId)
        .query(`
            SELECT * FROM Tasks 
            WHERE PersonId = @pid 
            AND DueDate >= DATEADD(day, 1-DATEPART(dw, GETDATE()), CAST(GETDATE() AS DATE))
            AND DueDate < DATEADD(day, 8-DATEPART(dw, GETDATE()), CAST(GETDATE() AS DATE))
        `);
    return result.recordset;
}

async function getTasksForNextWeek(personId) {
    const pool = await poolPromise;
    const result = await pool.request()
        .input('pid', sql.Int, personId)
        .query(`
            SELECT * FROM Tasks 
            WHERE PersonId = @pid 
            AND DueDate >= DATEADD(day, 8-DATEPART(dw, GETDATE()), CAST(GETDATE() AS DATE))
            AND DueDate < DATEADD(day, 15-DATEPART(dw, GETDATE()), CAST(GETDATE() AS DATE))
        `);
    return result.recordset;
}

async function getPendingOverallTasks(personId) {
    const pool = await poolPromise;
    const result = await pool.request()
        .input('pid', sql.Int, personId)
        .query(`
            SELECT TOP 10 * FROM Tasks 
            WHERE PersonId = @pid 
            AND Status != 'Completed'
            ORDER BY DueDate ASC
        `);
    return result.recordset;
}

async function addPerson(name, phoneNumber, role = 'Member', reportsToId = null, dailyScrumTime = '10:00', isAdmin = 0) {
    const pool = await poolPromise;
    await pool.request()
        .input('name', sql.NVarChar, name)
        .input('phone', sql.NVarChar, phoneNumber)
        .input('role', sql.NVarChar, role)
        .input('rtid', sql.Int, reportsToId || null)
        .input('dst', sql.NVarChar, dailyScrumTime)
        .input('isAdmin', sql.Bit, isAdmin)
        .query('INSERT INTO People (Name, PhoneNumber, Role, ReportsToId, DailyScrumTime, IsAdmin) VALUES (@name, @phone, @role, @rtid, @dst, @isAdmin)');
}

async function updatePerson(id, name, phoneNumber, dailyScrumTime = '10:00') {
    const pool = await poolPromise;
    await pool.request()
        .input('id', sql.Int, id)
        .input('name', sql.NVarChar, name)
        .input('phone', sql.NVarChar, phoneNumber)
        .input('dst', sql.NVarChar, dailyScrumTime)
        .query('UPDATE People SET Name = @name, PhoneNumber = @phone, DailyScrumTime = @dst WHERE Id = @id');
}

async function deletePerson(id) {
    const pool = await poolPromise;
    const transaction = new sql.Transaction(pool);
    try {
        await transaction.begin();
        await transaction.request().input('id', sql.Int, id).query('DELETE FROM Tasks WHERE PersonId = @id');
        await transaction.request().input('id', sql.Int, id).query('DELETE FROM People WHERE Id = @id');
        await transaction.commit();
    } catch (err) {
        if (transaction._aborted === false) await transaction.rollback();
        throw err;
    }
}

async function getDashboardStats() {
    const pool = await poolPromise;
    const stats = await pool.request().query(`
        SELECT 
            COUNT(*) as TotalTasks,
            SUM(CASE WHEN Status = 'Completed' THEN 1 ELSE 0 END) as CompletedTasks,
            SUM(CASE WHEN Status = 'Pending' THEN 1 ELSE 0 END) as PendingTasks,
            SUM(CASE WHEN Status = 'In Progress' THEN 1 ELSE 0 END) as InProgressTasks,
            (SELECT COUNT(*) FROM People) as TotalPeople
        FROM Tasks
    `);
    const recent = await pool.request().query(`
        SELECT TOP 5 t.*, p.Name as PersonName 
        FROM Tasks t 
        JOIN People p ON t.PersonId = p.Id 
        ORDER BY t.CreatedAt DESC
    `);
    return {
        summary: stats.recordset[0],
        recentTasks: recent.recordset
    };
}

async function deleteTask(id) {
    const pool = await poolPromise;
    await pool.request()
        .input('id', sql.Int, id)
        .query('DELETE FROM Tasks WHERE Id = @id');
}

async function updatePersonWhatsAppId(id, whatsappId) {
    const pool = await poolPromise;
    await pool.request()
        .input('id', sql.Int, id)
        .input('wid', sql.NVarChar, whatsappId)
        .query('UPDATE People SET WhatsAppId = @wid WHERE Id = @id');
}

async function logTaskActivity(taskId, messageType, text) {
    const pool = await poolPromise;
    await pool.request()
        .input('taskId', sql.Int, taskId)
        .input('type', sql.NVarChar, messageType)
        .input('text', sql.NVarChar, text)
        .query('INSERT INTO TaskActivityLog (TaskId, MessageType, MessageText) VALUES (@taskId, @type, @text)');
}

async function getTaskActivity(taskId) {
    const pool = await poolPromise;
    const result = await pool.request()
        .input('taskId', sql.Int, taskId)
        .query('SELECT * FROM TaskActivityLog WHERE TaskId = @taskId ORDER BY CreatedAt ASC');
    return result.recordset;
}

// ─── People with roles ─────────────────────────────────────────────────────
async function getBoss() {
    const pool = await poolPromise;
    const result = await pool.request().query(`SELECT TOP 1 * FROM People WHERE Role = 'Boss'`);
    return result.recordset[0] || null;
}

async function getHeadForPerson(personId) {
    const pool = await poolPromise;
    const result = await pool.request()
        .input('pid', sql.Int, personId)
        .query(`
            SELECT h.* FROM People p
            JOIN People h ON p.ReportsToId = h.Id
            WHERE p.Id = @pid AND h.Role = 'Head'
        `);
    return result.recordset[0] || null;
}

async function updatePersonRole(id, role, reportsToId, isAdmin = 0) {
    const pool = await poolPromise;
    await pool.request()
        .input('id', sql.Int, id)
        .input('role', sql.NVarChar, role)
        .input('rtid', sql.Int, reportsToId || null)
        .input('isAdmin', sql.Bit, isAdmin)
        .query('UPDATE People SET Role = @role, ReportsToId = @rtid, IsAdmin = @isAdmin WHERE Id = @id');
}

// ─── Scheduled Jobs ────────────────────────────────────────────────────────
async function getScheduledJobs() {
    const pool = await poolPromise;
    const result = await pool.request().query('SELECT * FROM ScheduledJobs ORDER BY Id');
    return result.recordset;
}

async function addScheduledJob(name, cronExpression, jobType) {
    const pool = await poolPromise;
    await pool.request()
        .input('name', sql.NVarChar, name)
        .input('cron', sql.NVarChar, cronExpression)
        .input('type', sql.NVarChar, jobType)
        .query('INSERT INTO ScheduledJobs (Name, CronExpression, JobType) VALUES (@name, @cron, @type)');
}

async function toggleScheduledJob(id, isEnabled) {
    const pool = await poolPromise;
    await pool.request()
        .input('id', sql.Int, id)
        .input('enabled', sql.Bit, isEnabled ? 1 : 0)
        .query('UPDATE ScheduledJobs SET IsEnabled = @enabled WHERE Id = @id');
}

async function deleteScheduledJob(id) {
    const pool = await poolPromise;
    await pool.request().input('id', sql.Int, id).query('DELETE FROM ScheduledJobs WHERE Id = @id');
}

async function updateScheduledJob(id, name, cronExpression, jobType) {
    const pool = await poolPromise;
    await pool.request()
        .input('id', sql.Int, id)
        .input('name', sql.NVarChar, name)
        .input('cron', sql.NVarChar, cronExpression)
        .input('type', sql.NVarChar, jobType)
        .query('UPDATE ScheduledJobs SET Name = @name, CronExpression = @cron, JobType = @type WHERE Id = @id');
}

async function updateJobLastRun(id) {
    const pool = await poolPromise;
    await pool.request().input('id', sql.Int, id).query('UPDATE ScheduledJobs SET LastRunAt = GETDATE() WHERE Id = @id');
}

// ─── Boss Reports ──────────────────────────────────────────────────────────
async function saveBossReport(reportText, triggeredBy) {
    const pool = await poolPromise;
    await pool.request()
        .input('text', sql.NVarChar, reportText)
        .input('by', sql.NVarChar, triggeredBy)
        .query('INSERT INTO BossReports (ReportText, TriggeredBy) VALUES (@text, @by)');
}

async function getBossReports(limit = 20) {
    const pool = await poolPromise;
    const result = await pool.request()
        .input('limit', sql.Int, limit)
        .query('SELECT TOP (@limit) * FROM BossReports ORDER BY SentAt DESC');
    return result.recordset;
}

// ─── App Users ─────────────────────────────────────────────────────────────
async function getAppUsers() {
    const pool = await poolPromise;
    const result = await pool.request().query('SELECT Id, Username, Role, IsActive, CreatedAt, LastLoginAt FROM AppUsers ORDER BY CreatedAt');
    return result.recordset;
}

async function getAppUserByUsername(username) {
    const pool = await poolPromise;
    const result = await pool.request()
        .input('u', sql.NVarChar, username)
        .query('SELECT * FROM AppUsers WHERE Username = @u');
    return result.recordset[0] || null;
}

async function getAppUserById(id) {
    const pool = await poolPromise;
    const result = await pool.request()
        .input('id', sql.Int, id)
        .query('SELECT * FROM AppUsers WHERE Id = @id');
    return result.recordset[0] || null;
}

async function addAppUser(username, passwordHash, role = 'admin') {
    const pool = await poolPromise;
    await pool.request()
        .input('u', sql.NVarChar, username)
        .input('ph', sql.NVarChar, passwordHash)
        .input('r', sql.NVarChar, role)
        .query('INSERT INTO AppUsers (Username, PasswordHash, Role) VALUES (@u, @ph, @r)');
}

async function toggleAppUser(id, isActive) {
    const pool = await poolPromise;
    await pool.request()
        .input('id', sql.Int, id)
        .input('a', sql.Bit, isActive ? 1 : 0)
        .query('UPDATE AppUsers SET IsActive = @a WHERE Id = @id');
}

async function updateLastLogin(id) {
    const pool = await poolPromise;
    await pool.request().input('id', sql.Int, id).query('UPDATE AppUsers SET LastLoginAt = GETDATE() WHERE Id = @id');
}

async function saveChatMessage(personId, role, content) {
    const pool = await poolPromise;
    await pool.request()
        .input('personId', sql.Int, personId)
        .input('role', sql.NVarChar, role)
        .input('content', sql.NVarChar, content)
        .query('INSERT INTO WhatsAppChatHistory (PersonId, Role, Content) VALUES (@personId, @role, @content)');
}

async function getRecentChatHistory(personId, limit = 10) {
    const pool = await poolPromise;
    const result = await pool.request()
        .input('personId', sql.Int, personId)
        .input('limit', sql.Int, limit)
        .query(`
            SELECT TOP (@limit) Role, Content 
            FROM WhatsAppChatHistory 
            WHERE PersonId = @personId 
            ORDER BY CreatedAt DESC
        `);
    return result.recordset.reverse().map(row => ({
        role: row.Role,
        content: row.Content
    }));
}

// --- Team Management Functions ---
async function getTeams() {
    const pool = await poolPromise;
    const result = await pool.request().query(`
        SELECT t.*, 
               (SELECT COUNT(*) FROM TeamMembers WHERE TeamId = t.Id) as MemberCount
        FROM Teams t
    `);
    return result.recordset;
}

async function getTeamMembers(teamId) {
    const pool = await poolPromise;
    const result = await pool.request().input('teamId', sql.Int, teamId).query(`
        SELECT p.*, tm.IsLead
        FROM TeamMembers tm
        JOIN People p ON tm.PersonId = p.Id
        WHERE tm.TeamId = @teamId
    `);
    return result.recordset;
}

async function createTeam(name, description) {
    const pool = await poolPromise;
    await pool.request()
        .input('name', sql.NVarChar, name)
        .input('desc', sql.NVarChar, description)
        .query('INSERT INTO Teams (Name, Description) VALUES (@name, @desc)');
}

async function addTeamMember(teamId, personId, isLead) {
    const pool = await poolPromise;
    await pool.request()
        .input('teamId', sql.Int, teamId)
        .input('personId', sql.Int, personId)
        .input('isLead', sql.Bit, isLead ? 1 : 0)
        .query(`
            IF EXISTS (SELECT 1 FROM TeamMembers WHERE TeamId = @teamId AND PersonId = @personId)
                UPDATE TeamMembers SET IsLead = @isLead WHERE TeamId = @teamId AND PersonId = @personId
            ELSE
                INSERT INTO TeamMembers (TeamId, PersonId, IsLead) VALUES (@teamId, @personId, @isLead)
        `);
}

async function removeTeamMember(teamId, personId) {
    const pool = await poolPromise;
    await pool.request()
        .input('teamId', sql.Int, teamId)
        .input('personId', sql.Int, personId)
        .query('DELETE FROM TeamMembers WHERE TeamId = @teamId AND PersonId = @personId');
}

async function getLeadsForPerson(personId) {
    const pool = await poolPromise;
    const result = await pool.request().input('personId', sql.Int, personId).query(`
        SELECT DISTINCT p.* 
        FROM TeamMembers tm
        JOIN TeamMembers tm2 ON tm.TeamId = tm2.TeamId
        JOIN People p ON tm2.PersonId = p.Id
        WHERE tm.PersonId = @personId AND tm2.IsLead = 1 AND p.Id != @personId
    `);
    return result.recordset;
}

// --- Settings Functions ---
async function getAllSettings() {
    const pool = await poolPromise;
    const result = await pool.request().query('SELECT * FROM AppSettings');
    const settings = {};
    result.recordset.forEach(row => {
        settings[row.SettingKey] = row.SettingValue;
    });
    return settings;
}

async function updateSetting(key, value) {
    const pool = await poolPromise;
    await pool.request()
        .input('key', sql.NVarChar, key)
        .input('val', sql.NVarChar, value.toString())
        .query(`
            IF EXISTS (SELECT 1 FROM AppSettings WHERE SettingKey = @key)
                UPDATE AppSettings SET SettingValue = @val WHERE SettingKey = @key
            ELSE
                INSERT INTO AppSettings (SettingKey, SettingValue) VALUES (@key, @val)
        `);
}

async function syncScrumScheduling() {
    const pool = await poolPromise;
    const settings = await getAllSettings();
    
    const dailyTime = settings.DailyScrumTime || '10:00';
    const weeklyTime = settings.WeeklyScrumTime || '17:00';
    const weeklyDay = settings.WeeklyScrumDay || '6';

    const parseCron = (timeStr, dayField = '*') => {
        const [hour, min] = timeStr.split(':').map(s => parseInt(s));
        return `${min || 0} ${hour || 0} * * ${dayField}`;
    };

    const dailyCron = parseCron(dailyTime, '1-6'); // Mon-Sat
    const weeklyCron = parseCron(weeklyTime, weeklyDay);

    // Update the ScheduledJobs table
    await pool.request()
        .input('daily', sql.NVarChar, dailyCron)
        .query("UPDATE ScheduledJobs SET CronExpression = @daily WHERE JobType = 'scrum'");
    
    await pool.request()
        .input('weekly', sql.NVarChar, weeklyCron)
        .query("UPDATE ScheduledJobs SET CronExpression = @weekly WHERE JobType = 'weekly_scrum'");
}

// --- Skills Management Functions ---
async function getSkills() {
    const pool = await poolPromise;
    const result = await pool.request().query('SELECT * FROM Skills ORDER BY CreatedAt DESC');
    return result.recordset;
}

async function getSkillById(id) {
    const pool = await poolPromise;
    const result = await pool.request().input('id', sql.Int, id).query('SELECT * FROM Skills WHERE Id = @id');
    return result.recordset[0];
}

async function addSkill(name, description, content, isAdminOnly = 0) {
    const pool = await poolPromise;
    await pool.request()
        .input('name', sql.NVarChar, name)
        .input('desc', sql.NVarChar, description)
        .input('content', sql.NVarChar, content)
        .input('isAdminOnly', sql.Bit, isAdminOnly)
        .query('INSERT INTO Skills (Name, Description, Content, IsAdminOnly) VALUES (@name, @desc, @content, @isAdminOnly)');
}

async function updateSkill(id, name, description, content, isAdminOnly = 0) {
    const pool = await poolPromise;
    await pool.request()
        .input('id', sql.Int, id)
        .input('name', sql.NVarChar, name)
        .input('desc', sql.NVarChar, description)
        .input('content', sql.NVarChar, content)
        .input('isAdminOnly', sql.Bit, isAdminOnly)
        .query('UPDATE Skills SET Name = @name, Description = @desc, Content = @content, IsAdminOnly = @isAdminOnly, UpdatedAt = GETDATE() WHERE Id = @id');
}

async function deleteSkill(id) {
    const pool = await poolPromise;
    await pool.request().input('id', sql.Int, id).query('DELETE FROM Skills WHERE Id = @id');
}

async function toggleSkill(id, isEnabled) {
    const pool = await poolPromise;
    await pool.request()
        .input('id', sql.Int, id)
        .input('isEnabled', sql.Bit, isEnabled ? 1 : 0)
        .query('UPDATE Skills SET IsEnabled = @isEnabled WHERE Id = @id');
}

async function getEnabledSkills() {
    const pool = await poolPromise;
    const result = await pool.request().query('SELECT Name, Content FROM Skills WHERE IsEnabled = 1');
    return result.recordset;
}

// ─── Projects ─────────────────────────────────────────────────────────────
async function getProjects() {
    const pool = await poolPromise;
    const result = await pool.request().query('SELECT * FROM Projects ORDER BY CreatedAt DESC');
    return result.recordset;
}

async function addProject(name, description, color = '#4f46e5') {
    const pool = await poolPromise;
    await pool.request()
        .input('name', sql.NVarChar, name)
        .input('desc', sql.NVarChar, description)
        .input('color', sql.NVarChar, color)
        .query('INSERT INTO Projects (Name, Description, Color) VALUES (@name, @desc, @color)');
}

async function updateProject(id, name, description, color, status) {
    const pool = await poolPromise;
    await pool.request()
        .input('id', sql.Int, id)
        .input('name', sql.NVarChar, name)
        .input('desc', sql.NVarChar, description)
        .input('color', sql.NVarChar, color)
        .input('status', sql.NVarChar, status)
        .query('UPDATE Projects SET Name = @name, Description = @desc, Color = @color, Status = @status WHERE Id = @id');
}

async function deleteProject(id) {
    const pool = await poolPromise;
    // Move tasks to General (Id: 1) before deleting
    await pool.request().input('id', sql.Int, id).query('UPDATE Tasks SET ProjectId = 1 WHERE ProjectId = @id');
    await pool.request().input('id', sql.Int, id).query('DELETE FROM Projects WHERE Id = @id AND Id != 1');
}

module.exports = {
    initDb,
    getPeople,
    addPerson,
    updatePerson,
    updatePersonRole,
    deletePerson,
    updatePersonWhatsAppId,
    getBoss,
    getHeadForPerson,
    getTasks,
    addTask,
    updateTask,
    deleteTask,
    updateTaskStatus,
    updateTaskRemarks,
    getOverdueTasks,
    markReminderSent,
    getTasksToRemindNow,
    getActiveScrumSession,
    startScrumSession,
    advanceScrumSession,
    endScrumSession,
    getTasksForWeek,
    getTasksForNextWeek,
    getPendingOverallTasks,
    getDashboardStats,
    logTaskActivity,
    getTaskActivity,
    getScheduledJobs,
    addScheduledJob,
    toggleScheduledJob,
    deleteScheduledJob,
    updateScheduledJob,
    updateJobLastRun,
    saveBossReport,
    getBossReports,
    getAppUsers,
    getAppUserByUsername,
    getAppUserById,
    addAppUser,
    toggleAppUser,
    updateLastLogin,
    saveChatMessage,
    getRecentChatHistory,
    getTeams,
    getTeamMembers,
    createTeam,
    addTeamMember,
    removeTeamMember,
    getLeadsForPerson,
    getAllSettings,
    updateSetting,
    syncScrumScheduling,
    refreshScrumSessionTime,
    getExpiredScrumSessions,
    getSkills,
    getSkillById,
    addSkill,
    updateSkill,
    deleteSkill,
    toggleSkill,
    getEnabledSkills,
    getProjects,
    addProject,
    updateProject,
    deleteProject
};
