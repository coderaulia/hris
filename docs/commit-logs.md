# Commit Logs

Last updated: 2026-04-09  
Current baseline on `main`: active working branch

Recent work expanded beyond deployment stability into frontend boot hardening and bundle reduction. The app now fails loudly on invalid Supabase environment configuration instead of silently breaking profile resolution, and the SPA has moved to route-based lazy loading for major feature modules. Records was split further so probation/PIP behavior loads separately from the standard records view, and Vite build output now emits gzip assets plus manual vendor chunks for Supabase, charts, UI, PDF, and Excel-heavy code paths.

That backend roadmap has now been turned into implementation. The repo now includes Supabase Edge Function scaffolding and shared helpers under `supabase/functions`, with working slices for `admin-user-mutations`, `auth-callbacks`, `approval-notifications`, and `report-exports`. The Settings user-management flow now routes privileged account creation and role changes through the server boundary, auth callback recovery uses a normalized edge path, notification resolution is server-side and provider-ready, and KPI/probation exports now generate binary PDF/XLSX files on the server, upload them to Storage, and return short-lived signed URLs to the browser. Edge Function env documentation was also standardized around `URL`, `ANON_KEY`, and `SERVICE_ROLE_KEY`, and a dedicated deploy checklist now lives in `docs/supabase-functions-deploy.md`.

The latest stabilization pass also corrected how Edge Functions talk to Postgres. Authenticated app-table reads now use a caller-scoped Supabase client so they honor the existing `authenticated` grants and RLS policies, while service-role access is reserved for truly privileged work such as auth admin operations and export Storage uploads/signing. This change fixed the live `report-exports` permission issue and was applied across the other function domains where the same pattern could have caused similar failures.

Immediate follow-up remains straightforward: deploy the functions and add secrets in Supabase, configure a real email provider later when ready, keep migrations current on existing databases, and verify login/profile resolution plus export downloads after any deployment that touches auth, redirects, RLS, Storage, or seeded setup.
