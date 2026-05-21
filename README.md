# HR Performance Suite

HR Performance Suite is a Vite single-page app for employee assessment, KPI tracking,
probation review, manpower planning, HR document generation, and role-based HR operations.

The app supports two backend modes through `src/lib/backend.js`:

- Supabase mode: the primary deployed model, using Supabase Auth, Postgres, RLS, Storage, and
  Edge Functions.
- Laravel mode: an optional API boundary under `backend/`, using Sanctum auth, Postgres, and
  `EmployeeScopeService` for role-aware scoping.

## Stack

- Frontend: Vite, vanilla JavaScript modules, Tailwind-enhanced CSS, Bootstrap utilities
- Backend options: Supabase direct adapter or Laravel API adapter
- Charts: Chart.js
- PDF and spreadsheet export: `jspdf`, `jspdf-autotable`, `exceljs`
- QA: Playwright, schema/migration/RLS hardening scripts, Laravel feature tests

## Core Modules

- Dashboard and department KPI drill-down
- Employee directory, role-aware access, and training records
- Competency assessment and assessment history
- KPI definitions, targets, approvals, weighted scores, and exports
- Manpower planning, headcount requests, and recruitment pipeline
- Probation and PIP workflows
- HR Documents for offer letters, contracts, payslips, warnings, terminations, templates, payroll
  import, and generated-document archive
- Settings, branding, organisation config, and admin activity log

## Project Structure

```text
.
├── backend/            # Optional Laravel API
├── complete-setup.sql  # Fresh Supabase baseline schema snapshot
├── docs/               # Current documentation index and focused references
├── migrations/         # Active Supabase migration chain and rollback companions
├── public/
├── src/                # Vite SPA modules, adapters, UI, data layer
├── supabase/functions/ # Edge Functions
└── tests/              # Playwright and support tests
```

## Local Setup

Install dependencies and start the frontend:

```bash
npm install
npm run dev
```

Run the usual frontend checks:

```bash
npm run build
npm run qa:hardening
npm run qa:e2e
```

Use `rtk` when working in the Codex shell, for example `rtk npm run build`.

## Supabase Setup

For a fresh Supabase project, follow [docs/fresh-supabase-setup.md](docs/fresh-supabase-setup.md).
The short version is:

1. Run [complete-setup.sql](complete-setup.sql).
2. Run the active migrations listed in the fresh setup guide.
3. Run [supabase/01_dummy_seed.sql](supabase/01_dummy_seed.sql) for demo data.
4. Copy [.env.example](.env.example) to `.env` and fill in `VITE_SUPABASE_URL`,
   `VITE_SUPABASE_ANON_KEY`, and `VITE_AUTH_REDIRECT_URL`.

The SQL seed prepares employee rows and `auth_email`, but it does not create Supabase Auth users.
Create the first login manually in Supabase Authentication using the same email as the employee
row. Recommended first login: `superadmin@demo.local`.

## Laravel Setup

Laravel mode is optional. Use it when the deployment should route browser writes and reads through a
PHP API instead of direct Supabase table access.

```bash
cd backend
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate
php artisan serve
```

Then set these frontend variables:

```env
VITE_BACKEND_TYPE=laravel
VITE_LARAVEL_API_URL=http://localhost:8000/api/v1
```

See [backend/README.md](backend/README.md) and
[docs/laravel-backend-local-runbook.md](docs/laravel-backend-local-runbook.md) for details.

## Deployment

- Hostinger/static deployment: [docs/hostinger-github-autodeploy.md](docs/hostinger-github-autodeploy.md)
- VPS deployment with Laravel: [docs/cloud-vps-deployment.md](docs/cloud-vps-deployment.md)
- Supabase Edge Functions: [docs/supabase-functions-deploy.md](docs/supabase-functions-deploy.md)

## Documentation

Start with [docs/README.md](docs/README.md) for the current documentation map.

Important current-state references:

- [Project status](docs/project-status.md)
- [Missing features](docs/missing-features.md)
- [Code audit](docs/code-audit.md)
- [Architecture](docs/architecture.md)
- [API endpoints](docs/api-endpoints.md)
- [Database schema](docs/db-schema.md)
- [Environment guide](docs/env-guide.md)

## Security Notes

- Keep RLS enabled and keep Data API grants aligned with policies.
- Never expose Supabase service-role keys to frontend hosting.
- Keep privileged user management, notifications, and server-side exports behind Edge Functions or
  the Laravel API.
- Replace seeded/demo passwords before any real rollout.

## License

This is not an open source project. Any use requires permission from Vanaila Digital.
