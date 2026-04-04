# API Endpoint Tracking

Last updated: 2026-04-03
Baseline commit: `0aeaab2`

## Current State

There is no custom application backend on the current `main` branch.
The app is a static frontend that talks directly to Supabase from the browser using `@supabase/supabase-js`.

That means this file is really tracking two things:

1. The current live integration surface that already exists.
2. Future backend/API candidates we may want once the static-only approach starts to hurt.

## Implemented HTTP Surface

| Path | Method | Status | Purpose | Notes |
| --- | --- | --- | --- | --- |
| `/healthz.json` | `GET` | Implemented | Static deploy health check used after deployment. | Used by the Hostinger deploy workflow for post-deploy validation. |

## Current Auth Surface

These are not custom endpoints in this repo; they are Supabase Auth operations used from the frontend.

| Flow | Current Implementation | Status | Notes |
| --- | --- | --- | --- |
| Sign in | `supabase.auth.signInWithPassword` | Implemented | Browser-side login flow. |
| Restore session | `supabase.auth.getSession` | Implemented | Used on app startup. |
| Sign out | `supabase.auth.signOut` | Implemented | Clears local session state and reloads app shell. |
| Create auth user | `supabase.auth.signUp` | Implemented | Used by superadmin setup flow. Redirect target depends on environment config. |
| Password reset request | `supabase.auth.resetPasswordForEmail` | Implemented | Redirect target depends on environment config. |
| Password update | `supabase.auth.updateUser` | Implemented | Used for first-login and recovery flows. |

## Current Data Access Surface

The app uses direct Supabase table access with Row Level Security.
There are no custom REST routes or server-side controllers on `main`.

| Domain | Supabase Resources | Main Owning Files | Status / Notes |
| --- | --- | --- | --- |
| App settings and branding | `app_settings` | `src/modules/data/settings.js` | Implemented. Branding is public-read in a limited way and admin-managed for writes. |
| Employees and org structure | `employees`, `competency_config` | `src/modules/data/employees.js`, `src/modules/data/config.js` | Implemented. Role and manager scope are controlled by RLS. |
| Assessments and training | `employee_assessments`, `employee_assessment_scores`, `employee_assessment_history`, `employee_training_records` | `src/modules/data/employees.js` | Implemented. Core assessment/training lifecycle is browser-driven. |
| KPI definitions and targets | `kpi_definitions`, `kpi_definition_versions`, `employee_kpi_target_versions` | `src/modules/data/kpi.js`, `src/modules/data/targets.js` | Implemented. Supports effective-month changes and approval flows. |
| KPI records and scoring | `kpi_records`, `employee_performance_scores`, `kpi_weight_profiles`, `kpi_weight_items` | `src/modules/data/kpi.js` | Implemented. Historical scoring relies on snapshot fields and version tables. |
| Probation and PIP | `probation_reviews`, `probation_qualitative_items`, `probation_monthly_scores`, `probation_attendance_records`, `pip_plans`, `pip_actions` | `src/modules/data/probation.js`, `src/modules/data/pip.js` | Implemented, but `probation_monthly_scores` and `probation_attendance_records` must exist from incremental migrations on older projects. |
| Audit logging | `admin_activity_log` | `src/modules/data/activity.js` | Implemented. Leadership-facing traceability is available. |

## Current Backend Gaps

These are the main reasons we may eventually want custom API endpoints:

- Auth redirect behavior is environment-sensitive and currently managed from frontend config.
- Heavy export logic still runs in the browser.
- Some approval, audit, and security logic still depends on frontend orchestration plus RLS rather than a server boundary.
- Backup/export automation has been intentionally removed from the public repo and needs a private execution environment.

## Future API Candidate Backlog

These are proposals only. None of these endpoints exist on `main` today.

| Candidate Endpoint | Priority | Problem It Solves | When To Build |
| --- | --- | --- | --- |
| `/api/auth/invite` | High | Centralizes account creation and redirect URL handling instead of depending on frontend build/runtime config. | Build if auth onboarding or password reset redirect issues keep recurring. |
| `/api/auth/password-reset-config` | Medium | Provides a single authoritative reset target and avoids hardcoded or env-only redirect drift. | Build if multiple environments need different reset behavior. |
| `/api/exports/probation` | Medium | Moves heavy probation PDF/Excel generation off the browser and allows consistent stamped exports. | Build if export performance or audit requirements become painful. |
| `/api/exports/kpi` | Medium | Supports larger KPI exports and scheduled report generation. | Build if leadership reporting grows beyond interactive browser exports. |
| `/api/kpi/approvals` | Medium | Moves approval decisions and validation into a server boundary for stronger audit control. | Build if approval logic becomes more complex or sensitive. |
| `/api/audit/summary` | Low | Generates scheduled audit summaries or operational digests for leadership. | Build after core production gaps are stable. |
| `/api/backups/run` | High, private only | Runs database export/backup jobs safely outside the public static app. | Build only in a private repo or private runtime, never in the public frontend repo. |

## Decision Guardrails

If we introduce a backend later, keep these rules:

1. Keep Supabase as the source of truth unless there is a strong reason to split data ownership.
2. Never expose service-role credentials in the static frontend build.
3. Put backup/export endpoints in a private runtime, not in the public repo.
4. Prefer adding a small backend for operational pain points first, not for features that are already working well through RLS.
5. Update this file the moment an endpoint moves from "candidate" to "implemented".

## Change Log Rule

Whenever we add, remove, or repurpose an endpoint or direct data integration:

- update this file
- update `docs/project-status.md`
- add a matching note to `docs/commit-logs.md`
