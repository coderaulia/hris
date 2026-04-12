# Project Status

Last updated: 2026-04-09

## Current State

- Frontend: Vite SPA with vanilla JS, Tailwind-enhanced custom UI, and Bootstrap utilities
- Backend: Supabase Auth + Postgres + RLS, plus implemented Supabase Edge Functions for privileged, callback, notification, and export boundaries
- Navigation: sidebar-driven app shell with role-aware menu groups
- Core modules: dashboard, employees, assessment, records, settings, KPI governance, probation/PIP, manpower planning with request workflow
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
- Deploy instructions now live in [docs/supabase-functions-deploy.md](/D:/web/hris/docs/supabase-functions-deploy.md)
- Production rollout depends on deploying the functions in Supabase after secrets are in place

## Current Gaps

- Manpower planning Phase 2 is implemented with baseline planning records, request intake, approval states, and pipeline-ready request tracking
- Manpower planning Phase 3A is now implemented with a recruitment-card workflow, kanban-style board, request progress rollups, and funnel summary cards in the manpower workspace
- README and setup docs have been aligned to the current bootstrap and deployment flow
- Approval notifications still require production provider secrets before live delivery works, but the edge path now supports configured delivery directly
- Large chart and vendor chunks still exist, but the heavier PDF/XLSX export flow has been moved out of the browser UI path
