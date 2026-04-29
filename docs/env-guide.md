# Environment Guide

Updated: 2026-04-29

Use `.env.example` as the source template. Never commit real `.env` secrets.

## Frontend Runtime Variables

| Variable | Required | Purpose |
|---|---:|---|
| `VITE_SUPABASE_URL` | Supabase mode | Supabase project URL for browser client |
| `VITE_SUPABASE_ANON_KEY` | Supabase mode | Supabase anon key for browser client |
| `VITE_AUTH_REDIRECT_URL` | Recommended | Auth redirect base URL |
| `VITE_SESSION_TIMEOUT_MINUTES` | Optional | Session timeout, defaults to 30 |
| `VITE_MONITOR_WEBHOOK_URL` | Optional | Client-side monitoring webhook |
| `VITE_SENTRY_DSN` | Optional | Client-side Sentry DSN |
| `VITE_ENABLED_MODULES` | Optional | Optional module toggle list |
| `VITE_BACKEND_TYPE` | Optional | `supabase` by default; set `laravel` for API mode |
| `VITE_BACKEND_MODE` | Optional | Backward-compatible backend mode alias |
| `VITE_LARAVEL_API_URL` | Laravel mode | Laravel API base URL, for example `http://localhost:8000/api/v1` |

## Supabase Edge Function Secrets

Set these as Supabase function secrets, not frontend hosting variables:

| Secret | Purpose |
|---|---|
| `URL` | Supabase project URL used inside Edge Functions |
| `ANON_KEY` | Caller-scoped Supabase anon key |
| `SERVICE_ROLE_KEY` | Service-role key for privileged operations |
| `EMAIL_PROVIDER` | `generic` or `resend` for notifications |
| `EMAIL_API_URL` | Provider API URL |
| `EMAIL_API_KEY` | Provider API key |
| `EMAIL_FROM` | Sender address |
| `EMAIL_REPLY_TO` | Optional reply-to address |

## Local QA Variables

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase URL for QA scripts |
| `SUPABASE_ANON_KEY` | Anon key for QA scripts |
| `SUPABASE_SERVICE_ROLE_KEY` | Service key for bootstrap/stress scripts |
| `SUPABASE_DB_URL` | Postgres URL for local bootstrap scripts |
| `E2E_BASE_URL` | Playwright base URL |

## Laravel Backend Variables

Laravel variables live in `backend/.env` and follow Laravel conventions:

- `APP_URL`
- `APP_KEY`
- `DB_CONNECTION`
- `DB_HOST`
- `DB_PORT`
- `DB_DATABASE`
- `DB_USERNAME`
- `DB_PASSWORD`

## Safety Notes

- Do not expose `SERVICE_ROLE_KEY` or `SUPABASE_SERVICE_ROLE_KEY` to browser builds.
- Do not paste real `.env` values into docs, commits, issues, or PR text.
- After changing frontend env values, restart Vite.
- After changing Supabase Edge Function secrets, redeploy or verify the function runtime picks up the new secret set.
