# Development Phase 1 Runbook

Last updated: 2026-04-12

## Goal

Phase 1 establishes a repeatable local baseline:

- verify the app builds
- verify static schema and security checks pass
- verify the E2E suite can resolve local environment variables
- define the minimum regression routine for day-to-day development

## Baseline Commands

### 1. Install dependencies

```bash
npm install
```

### 2. Start the app locally

```bash
npm run dev
```

Expected default app URL:

```text
http://127.0.0.1:5173
```

Note:

- Playwright can now start or reuse the local Vite server automatically
- manual `npm run dev` is still useful during active debugging

### 3. Run production build validation

```bash
npm run build
```

Expected result:

- Vite build completes successfully
- chunk warnings may still appear for mixed static/dynamic imports
- warnings are not currently treated as build failures

### 4. Run static hardening checks

```bash
npm run qa:hardening
```

This should validate:

- schema discipline
- migration safety
- RLS policy coverage
- bootstrap grant coverage

### 5. Run focused auth and live-schema smoke tests

```bash
npm run qa:e2e -- --grep "login resolves|auth callback redirect|live schema|server-backed dashboard"
```

### 6. Run workflow regression tests

```bash
npm run qa:e2e -- --grep "assessment and RLS|KPI definition moves|probation and PIP"
```

## Environment Expectations

Playwright now reads repo `.env` automatically through `playwright.config.js`, so local runs do not need manual `export` steps first as long as `.env` is populated.
Playwright also starts the Vite dev server automatically unless one is already running on the target URL.

Minimum variables for E2E:

- `E2E_BASE_URL`
- `SUPABASE_URL` or `VITE_SUPABASE_URL`
- `SUPABASE_ANON_KEY` or `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` for admin-auth smoke tests
- role credentials used by `tests/support/app.js`

## Current Baseline Status

Validated on 2026-04-12 from the local repo:

- `npm run build`: passed
- `npm run qa:hardening`: passed
- `npm run qa:e2e -- --grep "login resolves|auth callback redirect"`: passed
- focused workflow regressions now execute against the app and surface feature/data failures instead of bootstrap failures

## Known Non-Blocking Issues

- `src/modules/data.js` is imported both statically and dynamically, so some lazy loading does not split as cleanly as intended
- the largest remaining implementation hotspots are `src/modules/employees.js`, `src/modules/dashboard/core.js`, and `src/modules/kpi.js`
- local user-owned edits were already present in `package.json`, `package-lock.json`, and several Playwright specs before Phase 1 execution

## Definition Of Done For Phase 1

Phase 1 is considered complete when:

- build and hardening commands are green locally
- the team has a documented local runbook
- Playwright can read `.env` without manual shell exports
- any remaining E2E blockers are environment or data issues, not test bootstrap issues
