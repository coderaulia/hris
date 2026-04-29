# Coding Standards

Updated: 2026-04-29

## General

- Prefer the existing module style over new abstractions.
- Keep feature data access behind `src/lib/backend.js` adapters.
- Do not bypass the adapter from feature data modules when Supabase and Laravel both need the behavior.
- Keep changes scoped to the requested workflow.
- Preserve user-owned worktree changes unless explicitly told to revert them.

## JavaScript

- Use vanilla ES modules.
- Avoid global state except through `src/lib/store.js` and existing module-level state patterns.
- Use `escapeHTML` / `escapeInlineArg` for HTML strings that include dynamic values.
- Use `notify.withLoading`, `notify.warn`, `notify.error`, and `notify.success` for user-visible async flows.
- Log internal errors with `debugError('[context]', error)` or the closest existing module convention.
- Do not expose raw internal errors to end users.

## Backend Adapter Pattern

- Supabase implementation lives in `src/lib/backends/supabase-adapter.js`.
- Laravel implementation lives in `src/lib/backends/laravel-adapter.js`.
- If a feature needs create/update/delete behavior, add matching adapter methods for both backends.
- Laravel routes for new adapter methods belong in `backend/routes/api.php`.
- Laravel controllers should validate inputs at route entry for new production endpoints.

## SQL And Schema

- Verify real column names in migrations or schema docs before writing queries.
- Additive migrations only.
- Update `docs/db-schema.md`, `docs/fresh-supabase-setup.md`, and `scripts/support/canonical-migration-chain.mjs` when a new active migration is part of the normal setup path.
- Run `npm run qa:hardening` after schema/grant/RLS changes.

## Documentation

When code changes affect behavior, also update the relevant docs:

- `docs/project-status.md`
- `docs/api-endpoints.md` for route changes
- `docs/db-schema.md` for table/view/column changes
- `docs/commit-logs.md` or `commit-log.md` for implementation history
- feature plan docs such as `docs/manpower-planning-plan.md`

## Verification

- Frontend: `npm run build`
- Schema/security: `npm run qa:hardening`
- Touched JS modules: `node --check <file>`
- Touched PHP files: `php -l <file>`
- Browser flows: focused Playwright specs when environment and seed data are ready
