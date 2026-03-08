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
- **KPI Governance:** KPI definitions and monthly target overrides support effective-month changes, optional approval workflow, and version history.
- **Non-Retroactive Scoring:** KPI records store target/name/unit snapshots at submission time so old scores remain stable after KPI updates.

### **3. Robust Analytics Dashboard**
- **Actionable Insights:** Tracks overall organizational skill averages, highest/lowest-scoring groups, and KPI top performers continuously.
- **Data Exporting:** Every table and visualization can be instantly exported to Excel (`.xlsx`) or PDF.
- **Traceability:** Activity logs track admin-sensitive changes and KPI/assessment edits with actor + timestamp metadata.

### **4. Account & Security**
- **Password Recovery:** Built-in forgot password flow via Supabase reset email.
- **First Login Protection:** Temporary credentials can force mandatory password change on first login.
- **Session Protection:** Idle timeout and re-authentication prompts for sensitive operations.

---

## 🏗 Architecture & Stack 

- **Frontend Framework:** Vanilla JavaScript + HTML5 + Bootstrap 5 (Custom CSS)
- **Bundler:** Vite
- **Backend & Database:** Supabase (PostgreSQL + Auth)
- **Charting Engine:** Chart.js
- **PDF/Excel Exporting:** jspdf + exceljs

### Project Structure
```text
TNA/
├── index.html               ← Application Entry Point
├── vite.config.js           ← Vite Bundler Configurations
├── package.json             ← Project Dependencies
├── complete-setup.sql       ← Complete Supabase Database Architecture
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
3. Open the `complete-setup.sql` file from this project's root folder. Copy **everything** inside that file.
4. Paste it into your Supabase SQL Editor and click **RUN**. This single script handles everything:
   - Generates all Database Tables.
   - Triggers the necessary Row-Level Security (RLS) policies.
   - Inserts baseline employee/competency sample data and app defaults.

### Phase 1B: Required Incremental Migrations (Existing Projects)

If your project was already running before sprint updates, run these migration files in order from `/migrations`:

1. `20260307_safe_next_steps.sql`
2. `20260308_probation_monthly_attendance.sql`
3. `20260308_probation_hr_access_policy.sql`
4. `20260308_manager_kpi_competency_policy.sql`
5. `20260308_director_role_scope.sql`
6. `20260308_kpi_governance.sql`

This enables probation monthly scoring, HR probation access, director scope, and KPI governance (effective month + approvals + version history + snapshot scoring).

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
4. Create your first superadmin login in Supabase Auth, then link that email in `employees.auth_email` and role `superadmin`.

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

## 🤖 Automatic Deploy (GitHub Actions -> Hostinger)

This repository now includes an automatic deploy workflow:

- Workflow file: `.github/workflows/deploy-hostinger.yml`
- Trigger: push to `main` (and manual trigger from Actions tab)
- Process: install deps -> build (`dist/`) -> upload to Hostinger via FTPS

### 1) Add GitHub Repository Secrets

Open **GitHub -> Repository -> Settings -> Secrets and variables -> Actions -> New repository secret**.

Add these secrets:

- `HOSTINGER_FTP_HOST` (example: `ftp.yourdomain.com`)
- `HOSTINGER_FTP_USER`
- `HOSTINGER_FTP_PASSWORD`
- `HOSTINGER_FTP_REMOTE_DIR` (example: `/public_html/`)
- `VITE_SUPABASE_URL` (example: `https://your-project-id.supabase.co`)
- `VITE_SUPABASE_ANON_KEY` (your Supabase anon public key)
- `VITE_SESSION_TIMEOUT_MINUTES` (optional, default `30`)
- `VITE_MONITOR_WEBHOOK_URL` (optional, frontend error webhook endpoint)
- `VITE_SENTRY_DSN` (optional, if you provide Sentry script/SDK integration)
- `SUPABASE_DB_URL` (for scheduled backup workflow, format: `postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres`)
- `SITE_BASE_URL` (example: `https://hr.yourdomain.com`, used for post-deploy checks)
- `SITE_HEALTHCHECK_URL` (optional override, example: `https://hr.yourdomain.com/healthz.json`)
- `DEPLOY_NOTIFY_WEBHOOK_URL` (optional webhook for deploy success/failure notifications)

### 2) Push to `main`

Every push to `main` will automatically deploy the latest `dist/` build to your Hostinger folder.

### 3) First-run checks

- Ensure FTP account has write access to your target directory.
- Ensure `HOSTINGER_FTP_REMOTE_DIR` points to the correct site root (for most cases: `/public_html/`).
- If your repo default branch is not `main`, change the branch in `.github/workflows/deploy-hostinger.yml`.
- Ensure `public/healthz.json` is reachable after deploy (`/healthz.json`).

### 4) Scheduled Supabase backup/export

This repository includes `.github/workflows/supabase-backup.yml`:

- Trigger: every Sunday (`02:00 UTC`) and manual trigger from Actions tab.
- Output: compressed database dump (`.dump`), plain SQL (`.sql`), and activity log CSV artifact (if table exists).
- Retention: 30 days in GitHub Action artifacts.

Required secret:

- `SUPABASE_DB_URL`

---

## 📘 User Roles & Workflows

### 1. Admins (Super Users)
- **Capabilities:** Have unrestricted access. Only Admins can tweak the global Competency matrices, establish organization-wide KPI scales, map exact organizational hierarchies (Departments/Roles/Branches), and import/export raw infrastructure configuration JSONs.

### 2. Managers
- **Capabilities:** Have visibility linked to scoped department/team and can manage KPI for direct reports.
- **Workflow:**
   1. Open Assessment tab to review team submissions.
   2. Finalize managerial assessments.
   3. Manage KPI definitions/targets for scoped positions and employees.
   4. Monitor department KPI dashboards and monthly progress.

### 3. HR
- **Capabilities:** Operational reviewer for probation and KPI governance.
- **Workflow:**
   1. Manage probation reviews and attendance-based deductions.
   2. Approve/reject pending KPI definition or monthly target changes (when approval is enabled).
   3. Maintain probation scoring policy and pass threshold settings.

### 4. Employees
- **Capabilities:** Limited view, focusing only on their direct requirements.
- **Workflow:**
   1. Logs into their account.
   2. Promptly clicks 'Initiate Self Assessment' if a review cycle is currently open. They grade themselves across listed competency parameters.
   3. Clicks 'Submit monthly KPI data' on the Records/Overview page when applicable to pass performance metrics (like total calls or success retention) upward to the Manager.

---

## ✨ Support & Security Note

- **SQL Injection/XSS Prevention:** The system utilizes robust frontend sanitization via custom `escapeHTML` formatters natively across all list/render functions preventing DOM injections.
- **Row Level Security:** Ensure that your Supabase instance doesn't have RLS disabled. The queries are formatted exclusively expecting the native secure SDK flow.
- **Default Credentials:** No default production admin credential should be documented or shipped. Use unique credentials and force password rotation for temporary accounts.





