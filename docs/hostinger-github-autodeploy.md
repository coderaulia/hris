# Hostinger Git Deployment

This project is intended to deploy through Hostinger's direct GitHub integration, not through GitHub Actions FTP upload.

## Recommended setup

1. Open Hostinger hPanel.
2. Create or open your site or web app.
3. Connect the GitHub repository.
4. Set the project type to a Vite or static frontend build.
5. Use Node.js 20 unless Hostinger requires a newer supported version.

## Build settings

Use these values in Hostinger:

- Install command: `npm install`
- Build command: `npm run build`
- Output directory: `dist`

If Hostinger asks for framework type, use the Vite or static option. Use `Other` only if you intentionally add a custom Node entry server.

## Environment variables

Add these in Hostinger, not in GitHub secrets:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_AUTH_REDIRECT_URL`

Optional:

- `VITE_SESSION_TIMEOUT_MINUTES`
- `VITE_MONITOR_WEBHOOK_URL`
- `VITE_SENTRY_DSN`

## Supabase Auth URL setup

In `Supabase -> Authentication -> URL Configuration`, set:

- Site URL: your live Hostinger URL
- Redirect URLs: include the same live URL, and any local dev URL you still use for password reset or invite flows

`VITE_AUTH_REDIRECT_URL` should match the production URL users are sent back to.

## First deployment checklist

1. Confirm the domain points to Hostinger.
2. Confirm the repo branch in Hostinger is the branch you actually deploy from.
3. Confirm the frontend env vars are saved in Hostinger before the first build.
4. Confirm [healthz.json](/D:/web/hris/public/healthz.json) is reachable after deploy.
5. Confirm Supabase Auth URLs include the live domain.
