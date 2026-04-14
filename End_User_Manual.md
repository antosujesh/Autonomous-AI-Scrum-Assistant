# 🚀 Follow-up AI: End-User Manual

Welcome to **Follow-up AI**, your premium AI-powered project management assistant. This system bridges the gap between a modern administrative dashboard and your daily communication on WhatsApp, making task tracking effortless and automated.

---

## 📖 Table of Contents
1. [Quick Start Guide](#-quick-start-guide)
2. [Feature Inventory (Why Follow-up AI?)](#-feature-inventory-why-follow-up-ai)
3. [Task Mastery (Deep Dive)](#-task-mastery-deep-dive)
4. [The Dashboard (Manager Portal)](#-the-dashboard-manager-portal)
5. [The WhatsApp Experience](#-the-whatsapp-experience)
6. [Automated Features](#-automated-features)
7. [Best Practices & Tips](#-best-practices--tips)
8. [Troubleshooting](#-troubleshooting)

---

## ⚡ Quick Start Guide

### 1. Accessing the Dashboard
- **URL**: `http://localhost:3000` (or your provided server URL).
- **Login**: Use your designated credentials. (Default Admin: `admin` / `admin123`).

### 2. Connecting WhatsApp
To enable the AI bot, you must link your WhatsApp account:
1. Navigate to the **Connection** tab in the sidebar.
2. Ensure the status says "Waiting for Login."
3. Open WhatsApp on your phone -> Linked Devices -> Link a Device.
4. Scan the **QR Code** displayed on the dashboard.
5. Once "Connected" appears, your bot is live!

---

## 🚀 Feature Inventory (Why Follow-up AI?)

Follow-up AI is more than a task list; it's a proactive team manager. Here is every feature at your fingertips:

### 🤖 The WhatsApp AI Bot
- **Natural Language Tasking**: Create tasks just by saying *"Remind me to call John tomorrow"*.
- **Auto-Rescheduling**: Reschedule items by chatting (*"I'll finish this on Friday"*).
- **Consolidated Scrum Summaries**: Receive one clean update at the end of a session instead of multiple noisy pings.
- **Manager's Command Center**: Leads can text `update` to get an instant briefing of their entire team's status.
- **Fuzzy Name Matching**: Automatically recognizes you even if you use a linked device or change your profile name.

### 📊 The Manager's Dashboard (Web)
- **Glassmorphism Interface**: A ultra-modern, high-performance UI designed for clarity.
- **Interactive Kanban Board**: Drag-and-drop task management with real-time sync.
- **Hierarchical Visibility**: BOSS/HEAD/LEAD views provide the right level of detail for every role.
- **Dynamic Skills (SOP Injection)**: Upload your company policies (e.g., Refund Policy, Code Style) to the bot's brain instantly.
- **Live Audit Trails**: Trace every single task update back to the exact WhatsApp message or dashboard click.
- **Advanced Filtering**: Search and filter by Project, Priority, Assignee, or Status.

### ⚙️ Automation & Safety
- **Immediate Task Reminders**: Minute-by-minute deadline monitoring for both owners and follow-up persons.
- **Automated Scrum Watchdog**: Automatically times out inactive sessions to keep data clean.
- **Server Resilience**: Missed reminders are automatically sent as soon as the system comes back online.
- **Automatic Blocker Extraction**: AI identifies bottlenecks in your chat and creates specific `[BLOCKER]` tasks.
- **Hierarchical Broadcasts**: Completed Scrum reports are automatically sent to the relevant Team Head or Boss.

---

## 📋 Task Mastery (Deep Dive)

Tasks are the heart of the system. Understanding their anatomy is key to successful project management.

### 1. Anatomy of a Task
When creating or viewing a task, you will interact with these fields:
- **Description**: The core instruction (e.g., "Review the marketing assets").
- **Status**: Current state: `Pending` ➡️ `In Progress` ➡️ `Completed`.
- **Priority**:
    - `1 (Grey)`: Low Priority.
    - `2 (Blue)`: Standard.
    - `3 (Orange)`: High Priority.
    - `4 (Red)`: Urgent / Blocker.
- **Estimated Hours**: Used for team capacity planning.
- **Due Date**: The original deadline.
- **Re-Date (EDC)**: The *Rescheduled* or *Expected Date of Completion*. If this is set, the system treats it as the "Active" deadline.

### 2. The Task Lifecycle
1. **Creation**: Tasks can be created via the Dashboard "Add Task" button or by telling the AI on WhatsApp.
2. **Execution**: The user updates the status to "In Progress" as they start.
3. **Rescheduling**: If a user provides a new date during Scrum, the **Re-Date** is updated. The original Due Date remains for historical comparison. 
4. **Completion**: Once finished, the task is marked "Completed" and moved out of active views.

### 3. Audit Trails & Activity Logs
Every task has a **Live Audit Trail**. Click on a task in the list to view:
- **Who updated it**: Human or AI.
- **When**: Precise timestamps for every remark.
- **What was meant**: You can see the actual AI reasoning or the user's WhatsApp message that triggered the change.

---

## 🎨 The Dashboard (Manager Portal)

### 1. Kanban Board
The **Kanban Board** provides a visual bird's-eye view of your project.
- **Drag & Drop**: Move tasks between columns to update their status instantly.
- **Live Sync**: Updates made here reflect immediately in the database.

### 2. People & Team Hierarchy
Management relies on the "Reports To" structure:
- **Member**: Receives tasks and daily scrums.
- **Lead / Head**: Receives consolidated reports for their team members.
- **Boss**: Receives high-level summaries of all organizational activity.
> [!TIP]
> **Reporting lines** are configured in the "Teams" or "People" tab. Ensure every member has a designated supervisor to receive their automated summaries.

### 3. Skills (Company SOPs)
Admins can define "Skills" to change how the AI behaves.
- **Example**: Create a "Refund Policy" skill. 
- **Usage**: Once enabled, the AI bot on WhatsApp will know exactly how to answer questions about refunds without you needing to manually program it.

---

## 📱 The WhatsApp Experience

### 1. When & Why you get messages
The system communicates with you in three primary scenarios:
1. **Daily Scrum**: Triggered at your scheduled time (usually 10:00 AM) to sync on your tasks.
2. **Immediate Deadlines**: Triggered the exact moment a task hits its due time.
3. **Follow-up Notifications**: Triggered when a task you are following is updated by someone else.

### 2. Visual Message Formats

**The Daily Scrum**
> 🚀 *Daily Scrum Time*
> Hi [Name], I'll list your pending tasks one by one.
>
> *Task 1 of 3*
> Detail: Fix login bug.
> Due: 14 Apr, 12:00 PM
> ❓ *Any deviation or blockers for this task?*

**The Deadline Alert**
> 🚨 *TASK DEADLINE REACHED* 🚨
> 📋 *Task*: Submit Q1 Report
> ⏰ *Deadline*: 14 Apr, 5:00 PM
> *What is the update and new EDC (Expected Date of Completion)?*

### 3. The Follow-up Concept
Every task can have a **Follow-up Person**.
- Whenever the task owner provides an update (e.g., "I'm 50% done"), the system **instantly** alerts the Follow-up Person.
- This ensures management never has to "ping" someone for status; the system does it automatically.

### 4. Manager Commands
Managers (Heads/Leads) can use the `update` command:
- Text `update` or `status` to the bot.
- The bot replies with a **Consolidated Follow-up Report** of all tasks they are currently supervising, organized by team member.

---

## 🤖 Automated Features

### 1. The Watchdog
If you start a Scrum session but stop replying, the **Session Watchdog** takes over:
- After a set timeout (e.g., 10 minutes), it automatically ends your session and notifies the system of your inactivity.
- It attempts to keep the data consistent even if you are out of signal.

### 2. Immediate Task Reminders
Unlike standard calendars, Follow-up AI checks deadlines **every 60 seconds**.
- If your server was offline, it will "catch up" on missed reminders as soon as you turn it back on.

### 3. Automatic Blocker Creation
If you mention a "Blocker" during your Scrum (e.g., "I can't finish because the server is down"), the AI will:
1. Identify the blockage.
2. Ask if you'd like to create a new task.
3. Automatically create a task with the prefix `[BLOCKER]` so it stands out on the dashboard.

---

## 💡 Best Practices & Tips

- **Be Specific with Dates**: The AI understands "tomorrow at 5 PM," "next Monday," or "end of the week."
- **One Topic at a Time**: During Scrum, answer the specific question about the task mentioned. You can add general notes during the final wrap-up phase.
- **Dashboard Filters**: Use the search bar in the Tasks tab to find items across different projects or assignees quickly.

---

## 🔧 Troubleshooting

- **Bot not responding?**: Check the "Connection" tab in the dashboard. If it says "Disconnected," simply logout and re-scan the QR code.
- **Missing Task Update**: Ensure you used the bot's specific tools. Usually, just stating your progress ("Progress: Done") is enough for the AI to handle the rest.
- **Notification Overload**: If you are getting too many individual updates, talk to your admin about adjusting your "Follow-up" settings or role.

---
*Follow-up AI: Effortless project management, powered by intelligence.*
