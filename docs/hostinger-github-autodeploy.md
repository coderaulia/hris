# Hostinger GitHub Auto-Deploy

This repo now includes a GitHub Actions workflow for static deploys to Hostinger.

Workflow file:
[.github/workflows/deploy-hostinger.yml](/D:/web/hris/.github/workflows/deploy-hostinger.yml)

## What You Need In GitHub Secrets

Add these in `GitHub -> Repository -> Settings -> Secrets and variables -> Actions`.

Required:

- `HOSTINGER_FTP_HOST`
- `HOSTINGER_FTP_USER`
- `HOSTINGER_FTP_PASSWORD`
- `HOSTINGER_FTP_REMOTE_DIR`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_AUTH_REDIRECT_URL`
- `SITE_BASE_URL`

Optional:

- `VITE_SESSION_TIMEOUT_MINUTES`
- `VITE_MONITOR_WEBHOOK_URL`
- `VITE_SENTRY_DSN`
- `SITE_HEALTHCHECK_URL`
- `DEPLOY_NOTIFY_WEBHOOK_URL`

## Secret Value Examples

- `HOSTINGER_FTP_HOST`: `ftp.yourdomain.com`
- `HOSTINGER_FTP_USER`: your Hostinger FTP username
- `HOSTINGER_FTP_PASSWORD`: your Hostinger FTP password
- `HOSTINGER_FTP_REMOTE_DIR`: `/public_html/` or `/domains/app.yourdomain.com/public_html/`
- `VITE_SUPABASE_URL`: `https://your-project-id.supabase.co`
- `VITE_SUPABASE_ANON_KEY`: your Supabase anon key
- `VITE_AUTH_REDIRECT_URL`: `https://app.yourdomain.com`
- `SITE_BASE_URL`: `https://app.yourdomain.com`
- `SITE_HEALTHCHECK_URL`: `https://app.yourdomain.com/healthz.json`

## Supabase Auth Redirect Setup

In Supabase Authentication URL configuration, add your production site URL:

- Site URL: your live app URL, for example `https://app.yourdomain.com`
- Redirect URLs: also include the same URL if you use password reset or invite flows

This must match `VITE_AUTH_REDIRECT_URL`.

## Deploy Flow

On every push to `main`, GitHub Actions will:

1. install dependencies
2. build the Vite app with production env vars
3. upload `dist/` to Hostinger over FTPS
4. verify `healthz.json`

## First-Time Checklist

1. Confirm [public/healthz.json](/D:/web/hris/public/healthz.json) is reachable on the final site path.
2. Confirm FTP user has write access to the target directory.
3. Confirm your domain already points to Hostinger hosting.
4. Confirm Supabase Auth URLs include the live domain.
5. Push a small commit to `main` and watch the Actions tab for the first deploy.
