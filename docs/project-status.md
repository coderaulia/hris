# Project Status

Last updated: 2026-04-09

## Current State

- Frontend: Vite SPA with vanilla JS, Tailwind-enhanced custom UI, and Bootstrap utilities
- Backend: Supabase Auth + Postgres + RLS
- Navigation: sidebar-driven app shell with role-aware menu groups
- Core modules: dashboard, employees, assessment, records, settings, KPI governance, probation/PIP

## Security Baseline

- `complete-setup.sql` is the fresh-environment bootstrap snapshot
- Every schema/security change must also ship in `migrations/YYYYMMDD_description.sql`
- CI now blocks deploys when schema discipline, migration safety, RLS expectations, or Data API grants drift

## Current Gaps

- Manpower planning is still a placeholder
- README schema/setup section still needs a cleanup pass
- Bundle size is still large and only warned, not yet optimized
