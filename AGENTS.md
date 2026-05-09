# Agents

This is a lean handoff log. Update it at the end of a work session or when the user asks, not after every commit.

## 2026-04-29 Codex

Summary: Fixed manpower recruitment-card deletion through the backend adapter and aligned process docs with `claude.md`.
Scope: Manpower planning, documentation process, HR payroll setup docs.
Outcome: `d37d1d9` fixed the adapter delete path; the docs checkpoint added the missing process docs and payroll schema references.
Verification: `node --check`, `php -l`, `npm run build`, and `npm run qa:hardening` passed during the session.
Open notes: `_legacy/*` deletions were pre-existing/unrelated and intentionally left uncommitted. Session/status docs should stay lean and be updated only at session end or on request.

## 2026-05-08 Codex

Summary: Executed the audit fix order through migration QA, Laravel scoping, archive file parity, targeted coverage, and PDF chunk splitting.
Scope: Migration QA/docs, Laravel API controllers/routes/migrations/tests, backend adapter, HR document archive, bundle config, audit docs.
Outcome: Hardening passes again; assessment/training reads use shared scope; performance-score save and role validation are fixed; Laravel archive PDFs can upload/download/delete; `pdf-vendor` is below the 500 KB warning threshold.
Verification: `npm run build`, `npm run qa:hardening`, and `npx playwright test tests/backend-adapter.spec.js` passed. Laravel PHP tests were added but not run because `php`/`composer` were unavailable on PATH.
Open notes: Superseded on 2026-05-09 for rollback companions. Remaining gaps are broader backend/Playwright workflow coverage, external e-signature, live notification-provider QA, and production-like payroll import QA.

## 2026-05-09 Codex

Summary: Added rollback companions for every active Supabase migration and refreshed the audit gap list.
Scope: Supabase migration rollback scripts, schema discipline docs, missing-features/code-audit/status docs.
Outcome: The active chain now has 12 forward migrations and 12 rollback companions; rollback coverage is no longer the next open audit item.
Verification: `npm run qa:hardening` passed. `rtk` is still unavailable on PATH, so commands were run directly.
Open notes: Rollback scripts should be dry-run newest-first against a disposable database before production recovery use. Next audit gaps are backend feature-test breadth, Playwright workflow coverage, e-signature, notification live QA, and production-like payroll import QA.
