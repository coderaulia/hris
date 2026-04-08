# API Endpoint Tracking

Last updated: 2026-04-08  
Baseline commit: `main`

There is still no custom backend on `main`. The application is a Vite static SPA that talks directly to Supabase from the browser through `@supabase/supabase-js`, plus one static health check at `/healthz.json`. Auth flows are browser-side: sign-in, session restore, sign-out, password reset, password update, and superadmin user creation. The live data surface is Supabase tables for settings, employees, competency config, assessments, training, KPI governance, probation/PIP, and activity logs. As of 2026-04-08, Data API grants for `anon` and `authenticated` are now treated as a required baseline alongside RLS policies; missing grants can break role resolution even when policies look correct. Future backend work is still optional and should stay focused on auth redirect handling, heavy exports, approvals, and private backup automation.
