# Code Audit

Updated: 2026-05-09

This document captures current code flaws and missing features found during the local audit. Keep
this page focused on actionable implementation gaps; keep broad delivery status in
`docs/project-status.md`.

## Verification Snapshot

- `npm run build`: passed on 2026-05-08. Latest bundle split reduced `pdf-vendor` from 619.14 KB
  to 370.54 KB and split PDF-adjacent optional packages into named chunks.
- `npm run qa:hardening`: passed on 2026-05-08 and again on 2026-05-09 after adding rollback
  companions for every active Supabase migration. It also passed after the Laravel workflow parity
  migration and feature-test expansion on 2026-05-09, and again after the Laravel training adapter
  fix and Playwright adapter coverage expansion.
- `npm run build`: passed again on 2026-05-09 after the Laravel workflow parity and feature-test
  updates, and after the Laravel training adapter fix.
- `npx playwright test tests/backend-adapter.spec.js`: passed on 2026-05-08, including Laravel HR
  document archive upload/download adapter coverage. It passed again on 2026-05-09 with 10 tests
  covering Laravel employee/training save routing, manpower approval/pipeline routing, payroll
  import routing, and archive listing/download routing.
- Laravel feature tests were expanded again on 2026-05-09, but `php` and `composer` were still not
  available on PATH in the local shell, so they were not run in this pass.
- `rtk` is required by local instructions but was not available on PATH in this shell.

## Resolved Findings

### Rollback QA and canonical archive migration

Fixed locally on 2026-05-08:

- `scripts/qa/migration-safety-check.mjs` now treats `*.rollback.sql` as rollback scripts with
  rollback-specific naming and transaction checks instead of additive forward-migration checks.
- `scripts/qa/schema-discipline-check.mjs` now accepts
  `YYYYMMDD_description.rollback.sql` files under `migrations/`.
- `20260507_hr_document_archive.sql` is now part of `scripts/support/canonical-migration-chain.mjs`
  and the setup/schema docs.
- `npm run qa:hardening` passes again.

Follow-up resolved on 2026-05-09 by the full rollback companion pass below.

### Laravel scoped-read regressions

Fixed locally on 2026-05-08:

- `AssessmentController::index()` now uses `EmployeeScopeService::scopeQuery()`, matching score and
  history reads for HR/director/manager/employee scope behavior.
- `TrainingRecordController::index()` now scopes reads through `EmployeeScopeService::scopeQuery()`
  instead of returning all training records.
- Added Laravel feature coverage for HR/director assessment reads and employee/manager training
  reads.

### Performance score save path

Fixed locally on 2026-05-08:

- `PerformanceScoreController::store()` now uses `$request->user()->employee_id` instead of a
  missing `Auth` facade import.
- Added Laravel feature coverage for score creation and `calculated_by`.

### Employee role validation

Fixed locally on 2026-05-08:

- `EmployeeController` now accepts the full role set used by seed data and scoping logic:
  `superadmin`, `director`, `hr`, `manager`, `employee`.
- Added Laravel feature coverage for creating HR and director employees.

### HR document archive Laravel file parity

Fixed locally on 2026-05-08:

- Laravel archive metadata routes now enforce HR/superadmin access.
- Added `POST/GET /hr-document-archive/{id}/file` and plural aliases for PDF upload/download.
- `HrDocumentController` validates archive metadata and PDF uploads, stores PDFs on the private
  local disk, persists `storage_path`, and deletes stored files with archive rows.
- `laravel-adapter.js` now uploads the generated PDF blob with multipart form data and downloads
  archive files as authenticated blob URLs.
- Added Laravel feature tests for archive create/upload/download/delete and adapter-level
  Playwright coverage for upload/download routing.

### PDF vendor chunk split

Fixed locally on 2026-05-08:

- `vite.config.js` now splits PDF-adjacent vendor code into `pdf-vendor`,
  `pdf-html-vendor`, `pdf-svg-vendor`, and `pdf-image-vendor`.
- Latest build sizes: `pdf-vendor` 370.54 KB, `pdf-html-vendor` 201.04 KB,
  `pdf-svg-vendor` 181.71 KB, `pdf-image-vendor` 46.50 KB.

### Migration rollback companions

Fixed locally on 2026-05-09:

- Added `*.rollback.sql` companions for every older active Supabase migration in the canonical
  chain.
- Rollbacks now cover assessment/training/performance foundations, probation workflow, director/HR
  role scoping, KPI governance, security hardening, Data API grants, legacy employee-column
  restoration, manpower planning, dashboard views, HR document templates, and payroll records.
- The rollback set is intended for reverse-chain recovery, newest migration first, because later
  migrations may depend on objects created by earlier migrations.
- `npm run qa:hardening` passes with 12 forward migrations and 12 rollback migrations scanned.

### Laravel workflow schema parity and backend coverage expansion

Fixed locally on 2026-05-09:

- Added a Laravel parity migration for `app_settings`, manpower planning tables, recruitment
  pipeline, PIP tables, KPI governance version columns, employee target-version fields, and
  `kpi_weight_items.weight_pct`.
- Wrapped settings bulk updates in a database transaction.
- Added feature tests for manpower plan/request/pipeline CRUD and authorization, KPI
  definition/target approval paths, KPI weight profile/item saves, PIP action transitions, selected
  validation failures, pipeline delete behavior, and settings bulk-update authorization/validation.
- `npm run build` and `npm run qa:hardening` passed after these changes.
- Laravel tests still need to be executed in an environment with `php` and `composer` available.

### Laravel training adapter parity and workflow route coverage

Fixed locally on 2026-05-09:

- Employee save now replaces training rows through `backend.training.list/delete/create`, removing
  the direct Supabase delete path that broke Laravel backend mode.
- Training fetch now includes `id` and `notes` so existing normalized rows can be safely replaced.
- Expanded `tests/backend-adapter.spec.js` to cover Laravel employee/training save routing,
  manpower plan/request/pipeline routing, pipeline delete, payroll import routing, and HR document
  archive listing/download routing.
- `npx playwright test tests/backend-adapter.spec.js`, `npm run build`, and `npm run qa:hardening`
  passed after the change.

## Medium Priority Findings

### Backend feature test coverage still needs execution and deeper edge breadth

New feature tests now cover the highest-priority backend workflow gaps, but they could not be run in
the local shell because `php` and `composer` are unavailable. The suite still needs broader edge
coverage after the new tests are validated.

Remaining coverage:
- Run the expanded Laravel feature suite and fix any migration/controller issues it exposes.
- Add deeper manpower orphan-record cases, including request deletion/cancel paths and pipeline rows
  tied to missing or deleted requests.
- Extend KPI approval coverage for re-submit paths, duplicate version numbers, and stale approval
  updates.
- Expand validation failure coverage across the remaining write controllers.
- Add delete/orphan tests for employees, KPI records, HR document templates, training records, and
  payroll records where supported.

### Playwright E2E coverage gaps

Adapter-level Playwright coverage now proves Laravel routing for archive upload/download,
employee/training saves, manpower approval/pipeline, payroll import, and archive listing/download.
Full browser workflow E2E coverage is still missing for several product areas.

Flows still without full UI E2E coverage:
- Employee CRUD
- Training records management
- Manpower request approval and pipeline management
- Settings and competency configuration changes
- Payroll CSV import and reconciliation
- HR document archive listing/download through the real HR Documents workspace in both backend
  modes
- Future HR document signature actions
- Role-based access guardrails across superadmin, HR, director, manager, and employee

### External e-signature workflow remains unimplemented

Generated documents can be archived and downloaded, and signer placeholders exist in the PDF
layout. There is still no request-to-sign workflow, signer inbox, signature capture, or
signed/declined state.

### Production notification delivery is not verified

Notification dispatch code exists, but production provider secrets and live outbound delivery QA
are still pending.

### Payroll import needs production-like QA

CSV parsing and Laravel/Supabase persistence validation exist. QA with real employee IDs, payslip
PDF verification, and idempotency checks across both backend modes are still pending.

## Suggested Next Fix Order

1. Run the expanded Laravel feature suite in an environment with PHP/Composer and address any
   failures.
2. Add full UI Playwright specs for employee CRUD, training records, manpower, payroll import, real
   archive workspace download, and role guardrails. Adapter-level route coverage for these areas is
   now in place.
3. Deepen backend edge coverage for orphan/delete cases and KPI re-submit/stale approval paths.
4. Implement the external e-signature workflow for archived documents.
5. Run production-like payroll import QA and live notification-provider QA.
