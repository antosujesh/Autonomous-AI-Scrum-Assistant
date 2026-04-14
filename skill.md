# 🧠 Project Skill Map: Follow-up AI

This document provides a comprehensive technical breakdown of the **Follow-up AI** project, covering its architecture, logic flow, and specific features.

---

## 🏗️ Technical Architecture

### 1. **Core Engines**
- **WhatsApp Engine (`index.js` & Baileys)**: Manages the socket connection, QR code authentication, and message reception. It uses multi-device support to stay online.
- **Message Processor (`processor.js`)**: The "Brain" that decides if a message is a Scrum reply, a general command, or a request for a new task.
- **Scrum Engine (`scrum.js`)**: Orchestrates the state-machine for daily and weekly check-ins.
- **AI Layer (`openai.js`)**: Uses GPT-4o with Function Calling to turn natural language into database actions.
- **Job Manager (`job_manager.js` & `scheduler.js`)**: Handles CRON-based triggers for reminders and automated scrum starts.

### 2. **Database Schema (MSSQL)**
| Table | Purpose |
| :--- | :--- |
| `People` | Stores team members, roles (`Member`, `Lead`, `Head`, `Boss`), and reporting lines (`ReportsToId`). |
| `Tasks` | Core task data: description, status, due dates, remarks, and AI-generated updates. |
| `ScrumSessions` | Active session tracking for users currently in a check-in flow. |
| `TaskActivityLog` | Audit trail for every task, logging both AI and human interactions. |
| `WhatsAppChatHistory` | Stores recent chat interactions for AI conversational memory. |
| `Teams` & `TeamMembers` | Manages groups and assigns specific users as Leads for hierarchical reporting. |
| `Skills` | Dynamic SOPs (System Instructions) that can be toggled to change AI behavior on the fly. |
| `ScheduledJobs` | Stores CRON expressions for automated tasks (e.g., `0 10 * * 1-6` for Daily Scrum). |
| `AppSettings` | Global config: App Name, Logo, Scrum Times, and Timeout durations. |
| `BossReports` | Logs of automated summaries sent to high-level management. |
| `AppUsers` | Credentials and permissions for the dashboard web interface. |

---

## 🤖 AI & Logic "Skills"

### 1. **Context-Aware Task Management**
The AI doesn't just "chat"; it has a full view of the user's workload.
- **Injection**: Every message sent to the AI includes a list of the user's pending tasks and the current system time (Asia/Kolkata).
- **Tool Calling**:
  - `updateTaskStatus(taskId, status, comment, reDueDate)`: Transitions tasks between Pending, In Progress, and Completed.
  - `createTask(assignToPersonId, description, dueDate)`: Allows the AI to delegate work or capture new requirements.
  - `sendMessage(phoneNumber, text)`: Allows the AI to send direct notifications outside of standard flows.
- **Follow-up Notifications**: If a task has a `FollowUpPersonId`, the system automatically alerts that person on WhatsApp whenever the task is updated.

### 2. **The Scrum State Machine**
When a Scrum session starts, the interaction shifts from "General Chat" to "Structured Review":
1. **Intro**: Greets the user and lists task counts.
2. **Task-by-Task Review**: 
   - **Overdue Tasks**: Asks for an update and a new EDC (Expected Date of Completion).
   - **Future Tasks**: Asks about potential "blockers."
3. **Blocker Handling**: If a user mentions a blocker, the AI automatically creates a new task prefixed with `[BLOCKER]`.
4. **Final Wrap-up**: Asks for any other weekly plans.
5. **Hierarchical Reporting**: On completion, a professional summary is sent to the user's Leads or the Boss.

### 3. **Watchdog & Automated Reminders**
- **Session Watchdog**: A minute-by-minute worker sweeps for sessions that have exceeded the `ScrumReplyTimeout`. It auto-advances the flow and warns the user of the timeout.
- **Pre-Scrum Heads-up**: The system dynamically calculates a reminder time (e.g., 30m before) from the main Scrum CRON schedule. It sends a WhatsApp notification to ensure users are ready for their check-in.
- **Daily Overdue Reminders**: A morning job (e.g., 9:00 AM) that scans all overdue items and sends a consolidated nudge to the responsible parties.

### 4. **Dynamic Skills Engine**
The system supports "Skills" (SOPs). These are blocks of text stored in the database. 
- **Example**: A "Refund Policy" skill. 
- **Mechanism**: When enabled, the skill content is injected into the AI's System Prompt. This allows the admin to change organizational logic without touching a single line of code or restarting the server.

---

## 🎨 UI & Dashboard Features

Built with a **Premium Glassmorphism Design System**:
- **Connection Portal**: Real-time WhatsApp connection status and QR pairing.
- **Team Management**: Visual interface to define "Leads" and "Headed" structures.
- **Task Analytics**: Real-time status counters (Pending vs. Completed).
- **Live Audit Trails**: View the exact conversation history and AI reasoning for every single task in the system.
- **Settings**: Hot-swappable app titles, logos, and check-in schedules.

---

## 🛠️ Micro-Details (The "Small" Things)
- **Fuzzy Name Matching**: If a user connects via a "Linked Device" (which changes their WhatsApp ID), the system attempts to match them by their WhatsApp `pushName` against the database to maintain continuity.
- **Phone Normalization**: Automatically handles various international formats (e.g., adds `91` prefix for Indian numbers if missing).
- **Date Handling**: All AI interactions use `en-IN` localization to ensure "tomorrow" and "next week" match the user's timezone perfectly.
- **Remark History**: All updates are appended with a timestamp `[DD/MM/YYYY, HH:MM:SS]` to the `Remarks` field, preserving a full history within the database.
