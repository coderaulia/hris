# Architecture Map

Updated: 2026-04-29

This file is a lean architecture entry point. Keep implementation details in the focused docs linked below.

## System Shape

```text
Browser (Vite SPA)
|
`-- src/lib/backend.js
    |-- Supabase adapter
    |   |-- Supabase Auth
    |   |-- Postgres + RLS + Data API grants
    |   `-- Edge Functions for privileged/server-side flows
    `-- Laravel adapter
        `-- backend/ API + Sanctum + EmployeeScopeService
```

## Main Boundaries

- Frontend modules render screens and call domain data modules.
- Domain data modules call `src/lib/backend.js`; they should not bypass the adapter when both Supabase and Laravel need the behavior.
- Supabase mode is the default browser-to-Postgres path, protected by RLS and grants.
- Laravel mode is an optional API boundary for deployments that want the browser to avoid direct Postgres access.
- Edge Functions remain reserved for privileged auth mutations, notifications, and server-side report export/signing flows.

## Module Map

| Area | Primary Files | Data Surface |
|---|---|---|
| Auth | `src/modules/auth.js`, `src/lib/edge/auth.js` | Supabase Auth, `employees` |
| Dashboard | `src/modules/dashboard/*` | dashboard views and cross-module read models |
| Employees + Manpower | `src/modules/employees.js`, `src/modules/data/manpower.js` | `employees`, manpower plans, headcount requests, recruitment pipeline |
| Assessment + Training | `src/modules/assessment.js`, `src/modules/records/*` | assessment, score, history, and training tables |
| KPI | `src/modules/kpi.js`, `src/modules/data/kpi.js` | KPI definitions, versions, targets, records, weights |
| Probation/PIP | `src/modules/records-probation.js`, `src/modules/records/*` | probation and PIP tables |
| HR Documents | `src/modules/documents.js`, `src/modules/data/hr-documents.js`, `src/lib/pdfTemplates.js` | templates, reference options, payroll records, activity logs |
| Settings | `src/modules/settings.js`, `src/modules/data/settings.js` | app settings, org config, users |

## Canonical References

- Stack and runtime choices: [docs/tech-stack.md](/home/asw/Documents/dev/hris/docs/tech-stack.md)
- Database tables/views and schema rules: [docs/db-schema.md](/home/asw/Documents/dev/hris/docs/db-schema.md)
- Laravel API route surface: [docs/api-endpoints.md](/home/asw/Documents/dev/hris/docs/api-endpoints.md)
- Environment variables: [docs/env-guide.md](/home/asw/Documents/dev/hris/docs/env-guide.md)
- Coding and adapter rules: [docs/coding-standards.md](/home/asw/Documents/dev/hris/docs/coding-standards.md)
- Module/refactor ownership: [docs/refactor/module-map.md](/home/asw/Documents/dev/hris/docs/refactor/module-map.md)
- Current delivery status: [docs/project-status.md](/home/asw/Documents/dev/hris/docs/project-status.md)

## Known Constraints

- Keep RLS and Data API grants aligned with frontend table usage.
- Keep schema changes in numbered migrations and the canonical migration chain when they are part of normal setup.
- Do not expose service-role secrets to frontend builds.
- Keep `docs/commit-logs.md`, `agents.md`, and `docs/project-status.md` lean; update them at session end or when explicitly requested.
