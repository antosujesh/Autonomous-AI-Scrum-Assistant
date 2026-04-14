# 🚀 Follow-up AI: Autonomous Scrum & Task Assistant

[![Status](https://img.shields.io/badge/Status-Active-brightgreen.svg)]()
[![AI](https://img.shields.io/badge/AI-GPT--4o%20%7C%20Gemini-blue.svg)]()
[![Platform](https://img.shields.io/badge/Platform-WhatsApp-25D366.svg)]()
[![Design](https://img.shields.io/badge/Design-Glassmorphism-eb4034.svg)]()

**Follow-up AI** is a premium, AI-driven project management ecosystem that bridges the gap between structured administrative dashboards and real-time team communication on WhatsApp. It replaces tedious manual check-ins with autonomous AI state machines that conduct daily scrums, identify blockers, and update task statuses through natural language.

---

## ✨ Key Features

### 🤖 Autonomous WhatsApp Agent
- **Natural Language Tasking**: Register tasks by simply chatting: *"Remind me to finish the API docs by tomorrow 5 PM."*
- **Context-Aware Updates**: The AI knows your pending workload and updates statuses/remarks automatically.
- **Rescheduling Logic**: Full support for postponed tasks with automatic "Expected Date of Completion" (EDC) tracking.

### 🔄 Intelligent Scrum Engine
- **Automated Check-ins**: Daily and Weekly Scrum sessions triggered via CRON.
- **Blocker Extraction**: AI automatically identifies project bottlenecks and creates `[BLOCKER]` tasks.
- **Hierarchical Reporting**: Completed sessions are summarized and sent to Team Leads or the "Boss" automatically.

### 🎨 Premium Glassmorphism Dashboard
- **Visual Kanban**: Modern drag-and-drop interface for real-time task management.
- **Hierarchical Visibility**: Role-based views (Boss, Head, Lead, Member) for tailored organizational insights.
- **Audit Trails**: Every task update includes a full history of the AI's reasoning and the original WhatsApp message.

### 🧠 Dynamic "Skills" Engine
- **SOP Injection**: Instantly upload company policies (e.g., "Refund Rules", "Coding Standards") to the AI's "brain" without code changes.
- **Admin Control**: Hot-swappable prompts to change organizational logic on the fly.

---

## 🛠️ Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: MSSQL (SQL Server)
- **WhatsApp**: [@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys)
- **AI Models**: OpenAI GPT-4o, Google Gemini 1.5 Pro/Flash
- **UI**: EJS, Vanilla CSS (Premium Glassmorphism Design)

---

## 🚀 Quick Start

### 1. Prerequisites
- Node.js (v18+)
- MSSQL Server
- OpenAI or Google Gemini API Key

### 2. Installation
```bash
# Clone the repository
git clone git@github.com:antosujesh/Autonomous-AI-Scrum-Assistant.git

# Install dependencies
npm install
```

### 3. Environment Setup
Create a `.env` file in the root directory:
```env
DB_USER=your_user
DB_PASSWORD=your_password
DB_SERVER=localhost
DB_DATABASE=FollowUpAI
OPENAI_API_KEY=your_openai_key
```

### 4. Run the Application
```bash
# Start the server
npm start
```
*Navigate to `http://localhost:3000` to link your WhatsApp and access the dashboard.*

---

## 🔒 Security & Safety
- **.gitignore Protection**: Pre-configured to prevent `.env` and `auth_info/` (WhatsApp sessions) leaks.
- **Watchdog System**: Automatically terminates inactive Scrum sessions to maintain data integrity.
- **Tool Permissions**: Granular admin controls for AI file-writing and record-deletion capabilities.

---

## 👨‍💻 Author
**Anto SJ** - [GitHub](https://github.com/antosujesh)

