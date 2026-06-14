# Missing Features

Known product gaps confirmed by current docs and code shape.

## E-Signature Workflow

**Current state (Supabase mode: implemented):** A request-to-sign workflow exists end to end in
Supabase mode. `document_signature_requests` (migration `20260614_document_signatures.sql`) links an
archived document to signers with status `pending | signed | declined`. HR/superadmin request and
manage signers from the HR Documents archive (the `bi-pen` action on each archive row). Signers reach
their queue at **Records → My Signatures**, preview the source PDF, upload a signature image (PNG/JPEG
to the private `document-signatures` bucket), and sign or decline with a reason. Signer dispatch is
wired through the `document_signature_requests` action in `approval-notifications`. Capture is
upload-only for now (no drawn/typed signature).

**Remaining:**
- Laravel parity: the Laravel adapter currently returns graceful stubs; signature tables, controller
  routes, and `EmployeeScopeService` wiring are still needed for Laravel mode.
- Optional drawn/typed signature capture in addition to image upload.
- Full UI E2E coverage of the sign/decline flow (adapter-routing coverage exists in
  `tests/signature.spec.js`).
- Production notification QA for signer dispatch once provider secrets are live.

**Touch (done in Supabase pass):** `migrations/20260614_document_signatures.sql` (+ rollback),
`scripts/support/canonical-migration-chain.mjs`, `src/lib/backends/supabase-adapter.js`,
`src/lib/backends/laravel-adapter.js` (stubs), `src/modules/data/signatures.js`,
`src/modules/documents.js`, `src/modules/records/signaturesInbox.js`, records tab wiring in
`src/main.js`, `src/config/module-navigation.js`, `src/components/tab-records.html`,
`src/lib/edge/notifications.js`, and `supabase/functions/approval-notifications/index.ts`.

## Production Notification Provider

**Current state:** `supabase/functions/approval-notifications/index.ts` reads
`EMAIL_PROVIDER`, `EMAIL_API_URL`, `EMAIL_API_KEY`, `EMAIL_FROM`, and `EMAIL_REPLY_TO` from env.
Missing secrets log `"unconfigured"` and skip delivery. `resend` is the named production provider.
Frontend dispatch is wired for KPI definition submissions/decisions, KPI target
submissions/decisions, probation decisions, and PIP create/status updates.

**Needed:** Set secrets in Supabase dashboard (`EMAIL_PROVIDER=resend`, `EMAIL_API_KEY`,
`EMAIL_FROM`, optional `EMAIL_REPLY_TO`). Run `npm run qa:notifications` with real row IDs for
dry-run recipient resolution, then `npm run qa:notifications -- --live` to verify delivery for KPI
definition, KPI target, probation review, and PIP notifications.

## Payroll Import QA

**Current state:** `importPayrollRecords` upserts rows keyed by `(employee_id, payroll_period)`.
Both adapter paths are implemented. CSV import rejects missing `employee_id`, malformed
`payroll_period`, malformed cutoff dates, and non-numeric amounts before saving. Laravel API import
validates the same required shape server-side. No QA run against production-like data is recorded.

**Needed:** QA with real employee IDs. Verify payslip PDF output against imported rows. Confirm
upsert idempotency against Supabase and Laravel-backed environments.

**Note:** No code change expected unless edge cases surface in `importPayrollRecords` validation
or the payslip template in `pdfTemplates.js`.

## Migration Rollback Coverage

**Current state:** Rollback files now have a supported QA convention:
`migrations/YYYYMMDD_description.rollback.sql`. Every active Supabase migration in the canonical
chain now has a rollback companion, and `npm run qa:hardening` scans 12 forward migrations plus 12
rollback migrations successfully.

**Needed:**
- Keep future migrations paired with rollback scripts before merge.
- Staging dry-run of reverse-chain rollback order against a disposable database before relying on
  the scripts for production recovery.
- Environment ownership notes for who can approve destructive recovery operations.

## E2E Playwright Coverage Gaps

**Current state:** Eight specs cover auth, assessment, KPI approval, probation/PIP, HR documents,
backend adapter routing, stress workload, and live schema smoke. Adapter-level coverage now proves
Laravel archive upload/download, employee/training save, manpower approval/pipeline, payroll import,
and archive listing/download routing. Full UI coverage now also exercises superadmin employee
create/update/delete and manager guardrails against direct employee-management surfaces with mocked
Laravel APIs, but large functional areas still need full UI workflow E2E coverage.

**Missing flows:**
- Employee bulk import/export and broader delete edge cases
- Training records management
- Manpower plan/request approval and pipeline card management
- Settings and competency configuration changes
- Payroll CSV import and reconciliation
- HR document archive listing and file download through the real workspace in both backend modes
- HR document signature actions once implemented
- Broader role-based access guardrails (what HR, director, manager, and employee can and cannot
  see/do)

**Touch:** new or extended specs under `tests/`, seed data adjustments in `tests/support/` if
needed.

## Backend Feature Test Coverage Gaps

**Current state:** Feature tests now cover probation read/write scope, KPI definition/KPI record
authorization basics, scoped assessment/training reads, performance score creation, employee role
validation, HR document archive create/upload/download/delete, manpower plan/request/pipeline
authorization, KPI definition/target approval paths, KPI weight profile/item saves, PIP action
transitions, selected validation failures, and settings bulk update authorization/validation. A
Laravel parity migration was added for app settings, manpower, PIP, and richer KPI governance fields
needed by those controller paths. Employee training replacement now uses the backend adapter instead
of direct Supabase writes, so Laravel mode has route parity for training saves. Unit tests cover a
small part of `EmployeeScopeService`. The Laravel tests were not run locally because `php` and
`composer` were not available on PATH.

**Recently done on 2026-05-09:**
- Added `backend/database/migrations/2026_05_09_000000_add_laravel_workflow_parity_tables.php`.
- Wrapped `AppSettingController::bulkUpdate()` in a transaction.
- Added Laravel feature tests for manpower, KPI workflow, PIP workflow, and settings bulk updates.
- Fixed employee training replacement to use `backend.training` routes and added mocked Playwright
  coverage for employee/training, manpower, payroll, and archive Laravel adapter paths.
- Fixed the employee UI create path so new rows call backend create routes, added `hr` to the inline
  employee role picker, and added mocked UI coverage for employee create/update/delete plus one
  manager guardrail path.

**Remaining coverage:**
- Run the expanded Laravel feature suite with PHP/Composer available and fix any failures.
- KPI definition/version/target version approval state machine re-submit paths and stale approval
  updates.
- Broader validation failure responses (422) across the remaining write controllers.
- Delete operations and orphaned-record edge cases beyond the newly covered recruitment pipeline
  delete path.
- Employee CRUD, training record writes/deletes, payroll import, HR template deletes, and settings
  edge cases under Laravel.

**Touch:** new or extended `Feature/` test classes under `backend/tests/Feature/`.
