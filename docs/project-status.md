# Project Status

Last updated: 2026-04-09

## Current State

- Frontend: Vite SPA with vanilla JS, Tailwind-enhanced custom UI, and Bootstrap utilities
- Backend: Supabase Auth + Postgres + RLS
- Navigation: sidebar-driven app shell with role-aware menu groups
- Core modules: dashboard, employees, assessment, records, settings, KPI governance, probation/PIP
- Bundle strategy: route-based lazy loading is now in place for major modules, with Records split further so probation/PIP loads separately
- Build output: gzip assets and vendor chunking are configured for better first-load performance and cache behavior

## Security Baseline

- `complete-setup.sql` is the fresh-environment bootstrap snapshot
- Every schema/security change must also ship in `migrations/YYYYMMDD_description.sql`
- CI now blocks deploys when schema discipline, migration safety, RLS expectations, or Data API grants drift

## Planned Backend Expansion

- Edge Functions are now documented as the next server-side boundary for privileged and heavy operations
- Planned function domains:
  - auth callbacks and redirect normalization
  - heavy PDF/Excel exports
  - approval email notifications
  - sensitive superadmin auth/user mutations
- Normal application CRUD is still intended to remain browser-side through direct Supabase SDK calls with RLS enforcement
- See `docs/edge-functions-plan.md`

## Current Gaps

- Manpower planning is still a placeholder
- README schema/setup section still needs a cleanup pass
- Edge Functions are planned but not implemented yet
- Large PDF/Excel vendor chunks still exist, but they are now lazy-loaded instead of blocking the initial route
