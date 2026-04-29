# Project Status

Last updated: 2026-04-29

## Current State

- Frontend: Vite SPA with vanilla JS, Tailwind-enhanced custom UI, and Bootstrap utilities
- Backend (Dual Option):
  - Supabase Auth + Postgres + RLS + Edge Functions
  - **Laravel API** (PHP/Lumen) with Sanctum Auth and centralized security scoping via Adapter Pattern
- Navigation: sidebar-driven app shell with role-aware menu groups
- Core modules: dashboard, employees (manpower planning, requests, recruitment board, directory), assessment, records, settings, KPI governance, probation/PIP, and HR Documents workspace
- Adapter Pattern: The system is now fully abstracted behind `src/lib/backend.js`, allowing it to run against either Supabase or Laravel backends.
- Bundle strategy: route-based lazy loading is now in place for major modules, with Records split further so probation/PIP loads separately
- Build output: gzip assets and vendor chunking are configured for better first-load performance and cache behavior
- Process docs now exist for the `claude.md` workflow: tech stack, schema, API endpoints, coding standards, env guide, git workflow, commit log, and agent log.

## Security Baseline

- `complete-setup.sql` is the fresh-environment bootstrap snapshot
- Every schema/security change must also ship in `migrations/YYYYMMDD_description.sql`
- CI now blocks deploys when schema discipline, migration safety, RLS expectations, or Data API grants drift

## Edge Function Status

- Implemented function domains:
  - `admin-user-mutations` for managed auth user creation and privileged role updates
  - `auth-callbacks` for callback normalization and server-side profile resolution
  - `approval-notifications` for recipient resolution and placeholder/provider-ready notification dispatch
  - `report-exports` for server-side KPI/probation binary generation, Storage upload, and signed URL downloads
- Normal application CRUD is still intended to remain browser-side through direct Supabase SDK calls with RLS enforcement
- Edge Function secrets now use `URL`, `ANON_KEY`, and `SERVICE_ROLE_KEY`
- Authenticated Edge Function reads now use a caller-scoped client, while service-role access is kept for privileged tasks like auth admin and Storage signing
- Approval notifications now support configured provider delivery, with dry-run fallback when email secrets are absent
- Dashboard and probation export buttons now use the edge export flow end-to-end
- Deploy instructions now live in `docs/supabase-functions-deploy.md`
- Production rollout depends on deploying the functions in Supabase after secrets are in place

## Laravel Backend Status

- **Architecture**: Lumen/Laravel API in the `backend/` directory.
- **Security**: Centralized security via `EmployeeScopeService` replicates Postgres RLS logic.
- **Auth**: Laravel Sanctum (compatible with frontend SPA login).
- **Module Coverage**: All major frontend modules (Auth, Employees, KPIs, Probation, PIP, etc.) are supported via the Adapter Pattern.
- **Database**: Connects to the same Postgres instance as Supabase.

## HR Documents Status

- Phase 1 through Phase 4 from `implementation_plan.md` are implemented
- New module `src/modules/documents.js` provides:
  - role-gated HR Documents workspace (`hr` and `superadmin`)
  - dynamic template forms with live preview
  - runtime access guardrails + validation feedback
  - payslip payroll CSV template download/import backed by `hr_payroll_records`
- PDF engine `src/lib/pdfTemplates.js` now generates:
  - offer letter, employment contract, payslip, warning letter, termination letter
  - standardized filename output and multi-page-safe body rendering
- Generation events are written to `admin_activity_log` with action `document.generate`
- Smoke E2E coverage is available in `tests/hr-documents.spec.js`
- Payroll data upload is implemented for both Supabase and Laravel adapter paths:
  - Supabase uses `migrations/20260429_hr_payroll_records.sql`
  - Laravel exposes `/hr-payroll-records` and `/hr-payroll-records/import`

## Current Gaps

- HR documents are generated client-side only (no persistent document archive table yet)
- E-signature workflow is not implemented yet
- Approval notifications still require production provider secrets before live delivery works
- Large chart and vendor chunks still exist, although heavy KPI/probation exports are offloaded to edge functions
- Payroll import stores reusable rows per employee/month, but manual QA still needs to verify CSV import against production-like employee IDs and payslip PDF output.
- `claude.md` expects branch-per-task and rollback-script discipline; this repo now documents the expectation, but prior local work has been committed directly on `main` and existing migrations do not include paired rollback scripts.

## Completed On 2026-04-29

- Manpower recruitment-card deletion now routes through Supabase/Laravel backend adapters instead of a direct Supabase call inside the data module.
- Laravel API now exposes `DELETE /api/v1/recruitment-pipeline/{id}`.
- Manpower planning docs now reflect Phase 3A/3B/3C completion and list only optional future improvements.
- Documentation process alignment added:
  - `docs/tech-stack.md`
  - `docs/db-schema.md`
  - `docs/api-endpoints.md`
  - `docs/coding-standards.md`
  - `docs/env-guide.md`
  - `docs/git-workflow.md`
  - `commit-log.md`
  - `agents.md`
