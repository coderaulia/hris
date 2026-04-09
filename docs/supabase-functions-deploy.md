# Supabase Functions Deploy

Last updated: 2026-04-09

Use this checklist when deploying or redeploying Supabase Edge Functions for this project.

## Required secrets

Add these in Supabase Dashboard:

1. Open your project.
2. Go to `Edge Functions`.
3. Open `Secrets`.
4. Add or update these values:

- `URL`
- `ANON_KEY`
- `SERVICE_ROLE_KEY`
- `REPORT_EXPORT_BUCKET`
- `APPROVAL_NOTIFICATION_WEBHOOK_SECRET`
- `REPORT_EXPORT_WEBHOOK_SECRET`

Optional later, when email delivery is ready:

- `EMAIL_API_URL`
- `EMAIL_API_KEY`
- `EMAIL_FROM`
- `EMAIL_REPLY_TO`

Recommended defaults:

- `REPORT_EXPORT_BUCKET=report-exports`
- `APPROVAL_NOTIFICATION_WEBHOOK_SECRET` should be a long random string
- `REPORT_EXPORT_WEBHOOK_SECRET` should be a long random string

## CLI secret setup

If you are using the Supabase CLI, run:

```bash
supabase secrets set URL="https://your-project-id.supabase.co"
supabase secrets set ANON_KEY="your-anon-key"
supabase secrets set SERVICE_ROLE_KEY="your-service-role-key"
supabase secrets set REPORT_EXPORT_BUCKET="report-exports"
supabase secrets set APPROVAL_NOTIFICATION_WEBHOOK_SECRET="replace-with-a-long-random-secret"
supabase secrets set REPORT_EXPORT_WEBHOOK_SECRET="replace-with-a-long-random-secret"
```

Add these later when email is configured:

```bash
supabase secrets set EMAIL_API_URL="https://your-email-provider.example/send"
supabase secrets set EMAIL_API_KEY="your-email-api-key"
supabase secrets set EMAIL_FROM="noreply@example.com"
supabase secrets set EMAIL_REPLY_TO="hr@example.com"
```

## Functions to deploy

Deploy all current functions:

```bash
supabase functions deploy admin-user-mutations
supabase functions deploy auth-callbacks
supabase functions deploy approval-notifications
supabase functions deploy report-exports
```

If you only changed one function, redeploy just that one.

## Current function purpose

- `admin-user-mutations`: privileged managed-user creation and role mutation
- `auth-callbacks`: callback normalization and post-login role/profile resolution
- `approval-notifications`: placeholder-ready notification routing and provider hook integration
- `report-exports`: server-side KPI/probation PDF and XLSX generation with Storage signed URLs

## Storage requirement for exports

`report-exports` writes generated files to a private Storage bucket and returns a short-lived signed URL.

Expected behavior:

- bucket name defaults to `report-exports`
- signed URL TTL is 5 minutes
- browser downloads the returned URL directly

## Frontend env reminder

These are not Supabase Edge Function secrets. Keep them in Hostinger or the frontend host:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_AUTH_REDIRECT_URL`

Do not put `SERVICE_ROLE_KEY` in frontend hosting env.

## Post-deploy smoke check

After deploy, verify:

1. Login and auth callback flow still resolves the correct profile.
2. Superadmin managed-user creation still works.
3. Role change from Settings still works.
4. Dashboard KPI PDF/XLSX export downloads successfully.
5. Probation PDF/XLSX export downloads successfully.
6. Approval notifications return dry-run or unconfigured behavior without failing the app.
