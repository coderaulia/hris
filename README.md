# WEI HR Performance Suite

Competencies Assessment & KPI Performance Management System for Warna Emas Indonesia.

## Architecture

```
TNA/
├── index.html              ← Single HTML entry point (Vite)
├── vite.config.js           ← Vite configuration
├── package.json
├── supabase-schema.sql      ← Database schema (run in Supabase SQL Editor)
├── src/
│   ├── main.js              ← App entry: initialization, routing, event wiring
│   ├── lib/
│   │   ├── supabase.js      ← Supabase client config
│   │   ├── store.js         ← Reactive state store with event bus
│   │   └── utils.js         ← Shared utility functions
│   ├── modules/
│   │   ├── auth.js          ← Supabase authentication (sign in/out/restore)
│   │   ├── data.js          ← Supabase CRUD (employees, config, KPI)
│   │   ├── assessment.js    ← Assessment workflow (self/manager)
│   │   ├── records.js       ← Records table, reports, training log
│   │   ├── dashboard.js     ← Dashboard (Assessment + KPI summary)
│   │   ├── admin.js         ← Competencies configuration CRUD
│   │   ├── employees.js     ← Employee directory management
│   │   └── kpi.js           ← KPI input, definitions, records
│   └── styles/
│       └── main.css         ← Design system & all styles
└── _legacy/                 ← Old numbered JS files (backup)
```

## Setup Instructions

### 1. Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. In the SQL Editor, run the contents of `supabase-schema.sql`
3. Copy your project URL and anon key from **Settings > API**

### 2. Configure the App

Edit `src/lib/supabase.js` and replace the placeholder values:

```js
const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';
```

### 3. Create Users

In the Supabase dashboard:
1. Go to **Authentication > Users**
2. Create users with email/password
3. In the `employees` table, add a row for each user:
   - `employee_id`: unique ID (e.g., "101")
   - `name`: display name
   - `auth_id`: the UUID from the auth users table
   - `role`: `admin`, `manager`, or `employee`
   - Other fields as needed

### 4. Run Locally

```bash
npm install
npm run dev
```

### 5. Build for Production

```bash
npm run build
```

Output will be in the `dist/` folder.

## Features

### Existing (Migrated)
- ✅ **Assessment** — Self-assessment (employee) & manager assessment
- ✅ **Records** — Assessment history with competency reports
- ✅ **Dashboard** — Assessment summary with charts
- ✅ **Employees** — Staff directory with CRUD
- ✅ **Training** — Training log & recommendation tracking
- ✅ **Admin** — Competencies configuration

### New
- 🆕 **KPI Input** — Record KPI metrics per employee per period
- 🆕 **KPI Definitions** — Admin-managed KPI metrics with targets
- 🆕 **KPI Dashboard** — Achievement charts, top performers, category breakdown
- 🆕 **Supabase Auth** — Email/password authentication (replaces hardcoded passwords)
- 🆕 **Supabase Database** — PostgreSQL backend (replaces Google Sheets)
- 🆕 **Vite Build System** — ES modules, hot reload, optimized builds

## Migration from Google Sheets

| Before | After |
|---|---|
| Google Sheets + Apps Script | Supabase PostgreSQL |
| Hardcoded password hash | Supabase Auth (email/password) |
| Single `index.html` + numbered JS | Vite + ES modules |
| `localStorage` caching | Real-time Supabase queries |
| `0_config.js` → `6_employees.js` | `auth.js`, `data.js`, `assessment.js`, etc. |
