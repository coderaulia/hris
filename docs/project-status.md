# Project Status

Last updated: 2026-04-16

## Current State

- Frontend: Vite SPA with vanilla JS, Tailwind-enhanced custom UI, and Bootstrap utilities
- Backend: Supabase Auth + Postgres + RLS, plus implemented Supabase Edge Functions for privileged, callback, notification, and export boundaries
- Navigation: sidebar-driven app shell with role-aware menu groups
- Core modules: dashboard, employees (manpower planning, requests, recruitment board, directory), assessment, records, settings, KPI governance, probation/PIP, and HR Documents workspace
- Bundle strategy: route-based lazy loading is now in place for major modules, with Records split further so probation/PIP loads separately
- Build output: gzip assets and vendor chunking are configured for better first-load performance and cache behavior

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

## HR Documents Status

- Phase 1 through Phase 4 from `implementation_plan.md` are implemented
- New module `src/modules/documents.js` provides:
  - role-gated HR Documents workspace (`hr` and `superadmin`)
  - dynamic template forms with live preview
  - runtime access guardrails + validation feedback
- PDF engine `src/lib/pdfTemplates.js` now generates:
  - offer letter, employment contract, payslip, warning letter, termination letter
  - standardized filename output and multi-page-safe body rendering
- Generation events are written to `admin_activity_log` with action `document.generate`
- Smoke E2E coverage is available in `tests/hr-documents.spec.js`

## Current Gaps

- HR documents are generated client-side only (no persistent document archive table yet)
- E-signature workflow is not implemented yet
- Approval notifications still require production provider secrets before live delivery works
- Large chart and vendor chunks still exist, although heavy KPI/probation exports are offloaded to edge functions
