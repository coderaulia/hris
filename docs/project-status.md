# Project Status

Last updated: 2026-05-21

This is the current project recap for handoff and planning. Use `docs/README.md` as the docs map,
`docs/missing-features.md` for confirmed gaps, and `docs/code-audit.md` for audit fix order.

## Current Shape

- Frontend: Vite SPA using vanilla JS modules, Tailwind-enhanced custom UI, Bootstrap utilities,
  and a sidebar-driven app shell with role-aware navigation.
- Backends: the app can run against either Supabase or the Laravel/Lumen API through
  `src/lib/backend.js`.
- Supabase: Auth, Postgres, RLS, Storage, and Edge Functions remain the primary deployed backend
  model.
- Laravel: Sanctum auth and centralized `EmployeeScopeService` mirror the Supabase/RLS access
  model for the alternate API path.
- Core modules: dashboard, employees, manpower planning, recruitment pipeline, assessments,
  training records, settings, KPI governance, probation/PIP, and HR Documents.
- Feature composition is environment-driven through `VITE_ENABLED_MODULES`; required base modules
  remain enabled automatically.
- Build performance: route-level lazy loading and vendor chunking are in place; PDF generation is
  lazy-loaded and split into smaller PDF-adjacent chunks.

## Completed So Far

- Schema discipline is standardized around `complete-setup.sql` plus the canonical migration chain
  in `scripts/support/canonical-migration-chain.mjs`.
- Every active Supabase migration now has a matching
  `migrations/YYYYMMDD_description.rollback.sql` companion.
- Hardening QA checks schema location, migration naming/transactions, rollback naming/transactions,
  RLS expectations, and Supabase Data API grants.
- Employee role support now covers `superadmin`, `director`, `hr`, `manager`, and `employee` across
  Laravel validation and Supabase scoping assumptions.
- Laravel assessment and training reads use shared employee scoping.
- Laravel performance-score creation uses the authenticated request user correctly.
- Manpower recruitment-card deletion routes through the backend adapter in both Supabase and
  Laravel modes.
- Generated HR document archive is implemented for both backend modes:
  - Supabase stores PDFs in the private `hr-document-archive` bucket.
  - Laravel stores PDFs on the private local disk and exposes authenticated upload/download/delete
    endpoints.
- Payroll CSV import persists reusable employee/month rows through both adapter paths.
- PDF vendor chunking is below the current Vite warning threshold from the last recorded build.
- Process docs now exist for API endpoints, architecture, coding standards, environment setup, git
  workflow, schema, session logs, docs indexing, and agent handoff.
- Redundant historical docs were removed on 2026-05-21: the old project context page, Phase 1
  runbook, and refactor-only module/smoke notes. Current equivalents live in README, this status
  page, architecture, coding standards, and code audit docs.

## HR Documents

The HR Documents workspace is implemented as an HR/superadmin-only operational tool, not a static
export demo. It supports:

- offer letters, employment contracts, payslips, warning letters, and termination letters
- employee-backed documents plus manual candidate entry for offer letters
- dynamic forms, live preview, and A4 template editing
- DB-backed templates and reference options when migrations are applied, with graceful fallback for
  partial environments
- signer placeholders for printed/wet-sign and future digital-sign workflows
- payroll CSV template download/import backed by `hr_payroll_records`
- generation audit events in `admin_activity_log`
- generated PDF archive metadata and file storage through Supabase and Laravel

## Edge Functions

Implemented domains:

- `admin-user-mutations` for managed auth-user creation and privileged role updates
- `auth-callbacks` for callback normalization and server-side profile resolution
- `approval-notifications` for recipient resolution and provider-ready notification dispatch
- `report-exports` for server-side KPI/probation binary generation, Storage upload, and signed URL
  downloads

Production notification delivery still depends on real provider secrets and live QA.

## Verification Baseline

Most recent recorded checks:

- `npm run build`: passed on 2026-05-08.
- `npm run qa:hardening`: passed on 2026-05-09 with 12 forward migrations and 12 rollback
  migrations scanned.
- `npx playwright test tests/backend-adapter.spec.js`: passed on 2026-05-08, including Laravel HR
  document archive upload/download adapter coverage.
- Laravel PHP feature tests were added but have not been run locally because `php` and `composer`
  were unavailable on PATH in this shell.
- `rtk` is available in this shell and should prefix local verification commands per repo
  instructions.

## Open Gaps

- Backend feature-test breadth is still thin for manpower workflows, KPI approval state machines,
  KPI weight saves, PIP action transitions, validation failures, delete/orphan edge cases, and
  settings bulk update atomicity.
- Playwright workflow coverage is still missing for employee CRUD, training records, manpower
  approvals/pipeline management, payroll import, real archive workspace download, and role
  guardrails.
- E-signature is not implemented beyond signer placeholders and archived generated PDFs.
- Production notification provider secrets and live outbound notification QA are still pending.
- Payroll import needs production-like QA with real employee IDs, payslip PDF verification, and
  Supabase/Laravel idempotency checks.
- Rollback companions should be dry-run newest-first against a disposable database before relying
  on them for production recovery.

## Recent Milestones

- 2026-04-29: Manpower recruitment-card deletion now routes through Supabase/Laravel backend
  adapters.
- 2026-04-29: Documentation process aligned around lean updates in `docs/commit-logs.md`,
  `AGENTS.md`, and this status file.
- 2026-05-08: Audit pass restored hardening QA, added Laravel archive file parity, tightened
  Laravel scoping, added targeted backend/adapter coverage, and split PDF vendor chunks.
- 2026-05-09: Added rollback companions for every active Supabase migration and refreshed audit
  docs so rollback coverage is no longer the next open item.
- 2026-05-21: Refreshed the documentation surface to current state, added a docs index, removed
  stale historical/refactor docs, and fixed outdated absolute links.
