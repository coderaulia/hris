# HR Performance Suite

HR Performance Suite is a Vite single-page app for employee assessment, KPI tracking, probation review, and role-based HR operations. The frontend talks directly to Supabase for normal CRUD, while selected privileged flows now run through Supabase Edge Functions.

## Stack

- Frontend: vanilla JavaScript, Vite, Tailwind, Bootstrap utilities
- Backend: Supabase Auth, Postgres, RLS
- Charts: Chart.js
- Hosting: static hosting or Hostinger Git deployment
- Server boundaries: Supabase Edge Functions for managed users, auth callbacks, notifications, and exports

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
├── complete-setup.sql
├── migrations/
├── docs/
├── public/
├── src/
├── supabase/
│   └── functions/
└── tests/
```

## Fresh setup

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

## Security notes

- Keep RLS enabled.
- Keep Data API grants aligned with bootstrap and migrations.
- Never put `SERVICE_ROLE_KEY` in frontend hosting env.
- Use unique passwords for seeded demo users before any real rollout.

## Supporting docs

- [Fresh Supabase setup](/D:/web/hris/docs/fresh-supabase-setup.md)
- [Supabase functions deploy](/D:/web/hris/docs/supabase-functions-deploy.md)
- [Hostinger deployment](/D:/web/hris/docs/hostinger-github-autodeploy.md)
- [Architecture](/D:/web/hris/docs/architecture.md)
- [Project status](/D:/web/hris/docs/project-status.md)
