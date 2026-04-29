# HR Performance Suite

HR Performance Suite is a Vite single-page app for employee assessment, KPI tracking, probation review, and role-based HR operations. The frontend talks directly to Supabase for normal CRUD, while selected privileged flows now run through Supabase Edge Functions.

## Stack

- Frontend: vanilla JavaScript, Vite, Tailwind, Bootstrap utilities
- Backend (Dual-Option):
  - **Supabase**: Auth, Postgres, RLS, Edge Functions
  - **Laravel**: PHP/Lumen API, Postgres, Sanctum (Optional backend via Adapter Pattern)
- Charts: Chart.js
- Hosting: static hosting, Hostinger, or any PHP/Vite capable environment

## Backend Options (Adapter Pattern)

The application uses an **Adapter Pattern** located in `src/lib/backend.js`. You can switch between a direct Supabase connection and a custom Laravel API by setting the `VITE_BACKEND_TYPE` environment variable.

- **Supabase Mode**: Default. Uses the Supabase JS client and direct Postgres interactions.
- **Laravel Mode**: Routes all data requests to the Laravel API in the `backend/` directory. Useful for custom business logic or complex RLS-like logic (implemented via `EmployeeScopeService`).

To enable Laravel mode, set:
```env
VITE_BACKEND_TYPE=laravel
VITE_LARAVEL_API_URL=http://localhost:8000/api/v1
```

## Core modules

- Dashboard and department KPI drill-down
- Employee directory and role-aware access
- Competency assessment and training records
- KPI definitions, targets, approvals, and exports
- Probation and PIP workflows
- Settings, branding, and org configuration

## Project structure

```text
.
├── backend/            # Laravel API (PHP)
├── complete-setup.sql
├── migrations/
├── docs/
├── public/
├── src/
├── supabase/
│   └── functions/
└── tests/
```

## Fresh setup (Laravel Backend)

1. Ensure you have PHP 8.2+, Composer, and PostgreSQL installed.
2. Navigate to the `backend/` directory.
3. Install dependencies: `composer install`.
4. Copy `.env.example` to `.env` and configure your database (port 54322 for local Supabase Postgres).
5. Generate app key: `php artisan key:generate`.
6. Run migrations: `php artisan migrate`.
7. Start the API: `php artisan serve`.
8. Configure the frontend `.env` to use `VITE_BACKEND_TYPE=laravel`.

## Fresh setup (Supabase Direct)

1. Create a new Supabase project.
2. Run the SQL files in [docs/fresh-supabase-setup.md](/D:/web/hris/docs/fresh-supabase-setup.md) in order.
3. Copy [.env.example](/D:/web/hris/.env.example) to `.env`.
4. Fill in:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_AUTH_REDIRECT_URL` for your local or production URL
5. Install dependencies with `npm install`.
6. Start the app with `npm run dev`.

## Auth bootstrap

The SQL seed prepares employee rows and `auth_email`, but it does not create Supabase Auth users. Create the first login manually in `Supabase -> Authentication -> Users`, using the same email as the employee row. The app links `auth_id` automatically on first successful sign-in.

Recommended first login:

- `superadmin@demo.local`

## Edge Functions

This repo includes these function domains:

- `admin-user-mutations`
- `auth-callbacks`
- `approval-notifications`
- `report-exports`

Deploy and configure them with [docs/supabase-functions-deploy.md](/D:/web/hris/docs/supabase-functions-deploy.md).

## Hostinger deployment

The preferred production flow is Hostinger direct Git deployment, not GitHub Actions FTP upload.

Use [docs/hostinger-github-autodeploy.md](/D:/web/hris/docs/hostinger-github-autodeploy.md) for the current setup. In short:

1. Connect the GitHub repo in Hostinger hPanel.
2. Set the app type to a Vite/static build.
3. Add frontend env vars in Hostinger:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_AUTH_REDIRECT_URL`
   - optional monitoring/session values
4. Make sure Supabase Auth `Site URL` and redirect URLs match the live domain.

## Cloud / VPS Deployment

For custom VPS deployments (Ubuntu, Nginx, Docker), see [docs/cloud-vps-deployment.md](/D:/web/hris/docs/cloud-vps-deployment.md). This setup is recommended when using the **Laravel Backend** for production.

## Security notes

- Keep RLS enabled.
- Keep Data API grants aligned with bootstrap and migrations.
- Never put `SERVICE_ROLE_KEY` in frontend hosting env.
- Use unique passwords for seeded demo users before any real rollout.

## Supporting docs

- [Fresh Supabase setup](/D:/web/hris/docs/fresh-supabase-setup.md)
- [Tech stack](/D:/web/hris/docs/tech-stack.md)
- [Database schema](/D:/web/hris/docs/db-schema.md)
- [API endpoints](/D:/web/hris/docs/api-endpoints.md)
- [Coding standards](/D:/web/hris/docs/coding-standards.md)
- [Environment guide](/D:/web/hris/docs/env-guide.md)
- [Git workflow](/D:/web/hris/docs/git-workflow.md)
- [Supabase functions deploy](/D:/web/hris/docs/supabase-functions-deploy.md)
- [Hostinger deployment](/D:/web/hris/docs/hostinger-github-autodeploy.md)
- [Cloud / VPS deployment](/D:/web/hris/docs/cloud-vps-deployment.md)
- [Architecture](/D:/web/hris/docs/architecture.md)
- [Project status](/D:/web/hris/docs/project-status.md)
