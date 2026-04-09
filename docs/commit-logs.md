# Commit Logs

Last updated: 2026-04-09  
Current baseline on `main`: active working branch

Recent work expanded beyond deployment stability into frontend boot hardening and bundle reduction. The app now fails loudly on invalid Supabase environment configuration instead of silently breaking profile resolution, and the SPA has moved to route-based lazy loading for major feature modules. Records was split further so probation/PIP behavior loads separately from the standard records view, and Vite build output now emits gzip assets plus manual vendor chunks for Supabase, charts, UI, PDF, and Excel-heavy code paths.

The backend/server roadmap was also documented without being implemented yet. A new `docs/edge-functions-plan.md` defines the intended Supabase Edge Function boundaries for auth callbacks and redirect normalization, heavy report exports, approval email notifications, and sensitive superadmin auth/user mutations. The architectural direction remains RLS-first browser CRUD for ordinary application data, with Edge Functions reserved for privileged, secret-bearing, cross-system, or heavy-runtime work.

Immediate follow-up remains straightforward: implement the documented Edge Functions later in phased order, keep migrations current on existing databases, keep production env values accurate, and verify login/profile resolution after any deployment that touches auth, redirects, RLS, or seeded setup.
