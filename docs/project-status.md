# Project Status

Last updated: 2026-04-09

## Current State

- Frontend: Vite SPA with vanilla JS, Tailwind-enhanced custom UI, and Bootstrap utilities
- Backend: Supabase Auth + Postgres + RLS, plus implemented Supabase Edge Functions for privileged, callback, notification, and export boundaries
- Navigation: sidebar-driven app shell with role-aware menu groups
- Core modules: dashboard, employees, assessment, records, settings, KPI governance, probation/PIP
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
- Email notification delivery is still effectively placeholder until outbound email provider secrets are configured
- Dashboard and probation export buttons now use the edge export flow end-to-end
- Deploy instructions now live in [docs/supabase-functions-deploy.md](/c:/Users/Administrator/Documents/hris-vanaila/docs/supabase-functions-deploy.md)
- Production rollout depends on deploying the functions in Supabase after secrets are in place

## Current Gaps

- Manpower planning is still a placeholder
- README schema/setup section still needs a cleanup pass
- Approval notifications still need real email provider setup before live delivery works
- Large chart/vendor chunks still exist, but the heavy PDF/XLSX browser export path has been removed from the UI flow
