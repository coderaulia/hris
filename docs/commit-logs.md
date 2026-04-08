# Commit Logs

Last updated: 2026-04-08  
Current baseline on `main`: active working branch

Recent work focused on deployment and environment stability rather than new business features. The repo now includes fresh-project SQL bootstrap files, a reusable demo seed, Hostinger deployment notes, stronger role reconciliation on login, and explicit handling for the `hr` role in UI/navigation. The most important operational fix on 2026-04-08 was standardizing Supabase Data API grants so `anon` and `authenticated` roles can reach the expected tables while RLS remains the real access boundary. That change prevents the “API disabled” and silent employee-role fallback seen on new environments. Follow-up remains the same: keep migrations current on existing databases, keep production env values accurate, and verify login/profile resolution after each deployment that touches auth, RLS, or seeded setup.
