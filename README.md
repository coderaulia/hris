# HR Performance Suite

A modern and comprehensive Human Resources management system focusing on Employee Competencies Assessment and KPI Tracking, built for **Warna Emas Indonesia (WEI)**.

This system replaces older, disconnected spreadsheets by centralizing authentication, competency evaluations, and key performance indicators into a sleek, real-time dashboard powered by **Supabase (PostgreSQL)**.

---

## 🚀 Features Highlights

### **1. Competency Assessment**
- **Dual Evaluation System:** Employees perform self-assessments, which are then reviewed and finalized by their Managers.
- **Dynamic Questionnaires:** Questions branch based on the employee's role and configured competencies.
- **Training Recommendations:** Tracks recommended training for employees who score below the required baseline.

### **2. Employee KPI Manager**
- **Monthly/Quarterly KPI Tracking:** Employees can report data on targets ranging from Sales performance to Customer Satisfaction.
- **Department Drill-Downs:** Managers can view individual and aggregate departmental achievement scores, complete with 6-month trends.
- **KPI Library:** Admins can create overarching KPI definitions and apply global or personalized targets for every employee.

### **3. Robust Analytics Dashboard**
- **Actionable Insights:** Tracks overall organizational skill averages, highest/lowest-scoring groups, and KPI top performers continuously.
- **Data Exporting:** Every table and visualization can be instantly exported to Excel (`.xlsx`) or PDF.

---

## 🏗 Architecture & Stack 

- **Frontend Framework:** Vanilla JavaScript + HTML5 + Bootstrap 5 (Custom CSS)
- **Bundler:** Vite
- **Backend & Database:** Supabase (PostgreSQL + Auth)
- **Charting Engine:** Chart.js
- **PDF/Excel Exporting:** jspdf + xlsx

### Project Structure
```text
TNA/
├── index.html               ← Application Entry Point
├── vite.config.js           ← Vite Bundler Configurations
├── package.json             ← Project Dependencies
├── supabase-schema.sql      ← Complete Supabase Database Architecture
├── src/
│   ├── main.js              ← Core Routing, Event Wirings, and Initializer
│   ├── lib/
│   │   ├── supabase.js      ← Supabase SDK Setup & Credentials
│   │   ├── store.js         ← Native App Reactive Store (Pub/Sub)
│   │   └── utils.js         ← Global Formatting & Helpers
│   ├── components/          ← HTML Partial Views (Injected via Vite `?raw`)
│   ├── modules/             ← JS Feature Controllers (Auth, KPI, Dashboard, Data)
│   └── styles/              
│       └── main.css         ← Global Application Stylesheet
```

---

## ⚙️ Initial Setup Guide

### Phase 1: Supabase Configuration

1. Log in to [Supabase](https://supabase.com) and create exactly **one new project**.
2. Once the project dashboard is ready, navigate to the **SQL Editor** on the left menu.
3. Open the `supabase-schema.sql` file from this project's root folder. Copy **everything** inside that file.
4. Paste it into your Supabase SQL Editor and click **RUN**. This single script handles everything: 
   - Generates all Database Tables.
   - Triggers the necessary Row-Level Security (RLS) policies.
   - Inserts vital initial Default Data (The overarching admin account, default competencies, and a default company configuration).

### Phase 2: Connecting the Frontend

1. On your Supabase Dashboard, click on **Settings (Gear Icon)** -> **API**.
2. Keep this tab open. In your local project folder, create a `.env` file (or copy `.env.example`).
3. Add your Supabase credentials:
   ```env
   VITE_SUPABASE_URL=https://[YOUR_PROJECT_ID].supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR...
   ```

### Phase 3: Launching Locally

You must have **Node.js** installed on your computer.

1. Open your terminal in the project's root directory:
   ```bash
   npm install
   ```
2. Start the local development server:
   ```bash
   npm run dev
   ```
3. The app will launch (typically at `http://localhost:5173`). 
4. **Log in using the default Super Admin credential:**
   - **Email:** `admin@hrsuite.com`
   - **Password:** `admin123`

*(Note: Ensure you change this default password via the Settings or Supabase dashboard before putting your app into actual production!)*

---

## 🌍 Deployment Guide (Hostinger & Similar standard Web Hosts)

Since this app operates completely as a **Static Frontend Site (SPA)** connecting to Supabase, deploying to shared hosting like Hostinger is remarkably easy. You do **not** need Node.js installed on your Hostinger server.

1. First, inside your local project terminal, create the production build:
   ```bash
   npm run build
   ```
2. Vite will process and bundle all instructions into a brand new folder named **`dist/`**.
3. Log into your **Hostinger hPanel**.
4. Go to the **File Manager** for your specific domain or subdomain (e.g., `hr.yourdomain.com`).
5. Open the `public_html/` folder.
6. Upload the **contents** of your local `dist/` folder directly into `public_html/`. Make sure `index.html` sits immediately inside `public_html/`, not inside a sub-folder.
7. You're done! Visit your domain. 

---

## 📘 User Roles & Workflows

### 1. Admins (Super Users)
- **Capabilities:** Have unrestricted access. Only Admins can tweak the global Competency matrices, establish organization-wide KPI scales, map exact organizational hierarchies (Departments/Roles/Branches), and import/export raw infrastructure configuration JSONs.

### 2. Managers
- **Capabilities:** Have visibility strictly linked to their explicit Department.
- **Workflow:** 
   1. The Manager opens the app and switches to the "Assessments" tab to view what their reporting employees have submitted.
   2. They leave managerial scores, which ultimately create the locked final KPI report.
   3. They monitor their specific Department's monthly KPI dashboards to track performance visually.

### 3. Employees
- **Capabilities:** Limited view, focusing only on their direct requirements.
- **Workflow:**
   1. Logs into their account.
   2. Promptly clicks 'Initiate Self Assessment' if a review cycle is currently open. They grade themselves across listed competency parameters.
   3. Clicks 'Submit monthly KPI data' on the Records/Overview page when applicable to pass performance metrics (like total calls or success retention) upward to the Manager.

---

## ✨ Support & Security Note

- **SQL Injection/XSS Prevention:** The system utilizes robust frontend sanitization via custom `escapeHTML` formatters natively across all list/render functions preventing DOM injections.
- **Row Level Security:** Ensure that your Supabase instance doesn't have RLS disabled. The queries are formatted exclusively expecting the native secure SDK flow.

