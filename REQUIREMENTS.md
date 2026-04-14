# 📋 Project Requirements: Follow-up AI

This document outlines the necessary hardware, software, and configuration requirements to deploy and run the **Follow-up AI** (Autonomous Scrum & Task Assistant) ecosystem.

---

## 💻 System Requirements

### 1. **Hardware Requirements**
- **CPU**: Dual-core 2.0 GHz or higher (Recommended for handling concurrent WhatsApp sockets and AI processing).
- **RAM**: Minimum 2GB (4GB+ recommended if running the MSSQL server on the same machine).
- **Storage**: 500MB of free space for application files and auth tokens (Logs and database growth depend on usage).
- **Network**: Stable internet connection with low latency for WhatsApp Web socket connectivity.

### 2. **Software Stack**
- **Runtime**: [Node.js](https://nodejs.org/) (v18.x or v20.x LTS).
- **Package Manager**: [npm](https://www.npmjs.com/) (v9.x or higher).
- **Database Engine**: [Microsoft SQL Server (MSSQL)](https://www.microsoft.com/en-us/sql-server) (2017 or later).
  - *Note: Express Edition is sufficient for small-to-medium teams.*
- **Operating System**: Windows, Linux (Ubuntu/Debian recommended), or macOS.

---

## 🔑 Technical Dependencies

### 1. **AI Providers (Minimum one required)**
- **OpenAI API**: 
  - Access to `gpt-4o` or `gpt-4o-mini`.
  - Valid API Key with usage credits.
- **Google Gemini API**:
  - Access to `gemini-1.5-flash` or `gemini-1.5-pro`.
  - Valid API Key from [Google AI Studio](https://aistudio.google.com/).

### 2. **WhatsApp Integration**
- A dedicated WhatsApp account/number.
- A physical device to scan the QR code for the initial multi-device link.

---

## 📦 Core Node.js Dependencies

The following primary libraries are required for the system to function:

| Dependency | Purpose |
| :--- | :--- |
| `@whiskeysockets/baileys` | WhatsApp Web API Multi-Device support. |
| `express` | Web dashboard and API server. |
| `mssql` | Connection and querying for the SQL database. |
| `openai` / `@google/generative-ai` | LLM communication layers. |
| `node-cron` | Scheduling of Scrum sessions and automated reminders. |
| `ejs` | Server-side templating for the glassmorphism UI. |
| `dotenv` | Environment variable management. |

---

## 🛠️ Configuration Requirements

### **Environment Variables (`.env`)**
A `.env` file must be present in the root directory with the following keys:

| Key | Description | Example |
| :--- | :--- | :--- |
| `DB_SERVER` | SQL Server address | `localhost` or `192.168.1.1` |
| `DB_DATABASE` | Targeted database name | `FollowUpAI` |
| `DB_USER` | SQL authentication username | `sa` |
| `DB_PASSWORD` | SQL authentication password | `YourSecurePassword` |
| `OPENAI_API_KEY` | (Optional) OpenAI Key | `sk-proj-...` |
| `GEMINI_API_KEY` | (Optional) Google Gemini Key | `AIzaSy...` |

### **Database Configuration**
- **Mixed Mode Authentication**: SQL Server must have SQL Server authentication enabled.
- **TCP/IP Enabled**: The SQL Browser and TCP/IP protocol must be active in SQL Server Configuration Manager.

---

## 🌐 Network & Port Requirements
- **Port 3000**: Default port for the Web Dashboard interface (Configurable in `ui_server.js`).
- **Port 1433**: Default MSSQL port (must be open on the server).
- **HTTPS (Optional)**: If deploying to a production server, a reverse proxy (Nginx) is recommended for SSL.

---

> [!IMPORTANT]
> **WhatsApp Multi-Device Stability**: Ensure the WhatsApp account is not used for heavy spamming, as excessive automated messages can lead to account temporary bans. It is recommended to use a dedicated business number. 
