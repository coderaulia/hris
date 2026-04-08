# Project Status

Last updated: 2026-04-08  
Baseline commit: `main`

HR Performance Suite remains a Vite static SPA backed by Supabase Auth, Postgres, RLS, and browser-side exports. Core product scope is in place: employee management, competency assessments, training logs, KPI governance, probation/PIP workflows, dashboard reporting, and Hostinger deployment. The most recent operational lesson is now explicit: RLS alone is not enough for fresh environments. Supabase Data API grants for `anon` and `authenticated` must exist alongside policies, or branding fetches, profile resolution, and role-aware login can fail in production. Fresh setup SQL and a retrofit migration now standardize that baseline. Current priorities are steadying production auth redirect handling, keeping migrations consistent across environments, and expanding automated regression coverage for assessment, KPI approval, and probation flows while the internal refactor continues incrementally.
