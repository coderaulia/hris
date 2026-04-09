# Project Context

Last updated: 2026-04-08

## What This Is

**HR Performance Suite** — a browser-only SPA for managing the full employee performance lifecycle inside a single organisation. There is no custom backend; everything talks directly to Supabase from the browser via `@supabase/supabase-js`.

## Stack

| Layer | Technology |
|---|---|
| Build | Vite (static SPA) |
| Auth | Supabase Auth (browser-side) |
| Database | Supabase Postgres + RLS |
| Client SDK | `@supabase/supabase-js` |
| Exports | Browser-side (client-generated) |
| Hosting | Hostinger (static files) |
| Health check | `/healthz.json` (static file) |

## Roles

- `anon` — unauthenticated access (branding fetch, login page)
- `authenticated` — base role post-login
- `hr` — HR staff with elevated access to assessments, KPIs, probation workflows
- `superadmin` — full access including user creation

> **Critical operational note**: RLS policies alone are NOT enough on a fresh Supabase environment. Data API grants for both `anon` and `authenticated` must be explicitly created alongside policies. Missing grants break profile resolution and role-aware login even when policies appear correct.

## Core Feature Modules

1. **Employee Management** — employee records, profiles, role assignment
2. **Competency Assessments** — configurable competency frameworks, scoring
3. **Training Logs** — training records per employee
4. **KPI Governance** — KPI definition, targets, approval workflows
5. **Probation / PIP Workflows** — probation tracking, performance improvement plans
6. **Dashboard & Reporting** — aggregated views, browser-side exports
7. **Settings / Branding** — org-level configuration fetched on load

## Auth Flows (all browser-side)

- Sign-in
- Session restore
- Sign-out
- Password reset
- Password update
- Superadmin user creation

## Known Pain Points

- Fresh environment setup requires running bootstrap SQL + retrofit migration to set Data API grants
- Production auth redirect handling is still being stabilised
- RLS + grant mismatch causes silent employee-role fallback (looks like auth works, but role is wrong)

## What Does NOT Exist Yet

- Custom backend server (optional, not planned on main)
- Server-side exports (heavy exports are a future optional backend concern)
- Automated regression tests for assessment, KPI approval, probation flows
