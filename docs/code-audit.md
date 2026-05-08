# Code Audit

Updated: 2026-05-08

This document captures current code flaws and missing features found during the local audit. Keep
this page focused on actionable implementation gaps; keep broad delivery status in
`docs/project-status.md`.

## Verification Snapshot

- `npm run build`: passed on 2026-05-08. Latest bundle split reduced `pdf-vendor` from 619.14 KB
  to 370.54 KB and split PDF-adjacent optional packages into named chunks.
- `npm run qa:hardening`: passed on 2026-05-08.
- `npx playwright test tests/backend-adapter.spec.js`: passed on 2026-05-08, including Laravel HR
  document archive upload/download adapter coverage.
- Laravel feature tests were added, but `php` and `composer` were not available on PATH in the
  local shell, so they were not run in this pass.
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

Remaining note: older forward migrations still do not have rollback companions.

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

## Medium Priority Findings

### Backend feature test coverage still needs breadth

New feature tests cover the high-risk scope/archive fixes above, but broader backend workflows are
still thin.

Missing coverage:
- Manpower CRUD and authorization edge cases
- KPI version/target approval state machine
- KPI weight profile and item save paths
- PIP action transitions
- Validation failure responses across write controllers
- Delete operations and orphaned-record edge cases
- Settings bulk update atomicity

### Playwright E2E coverage gaps

Adapter-level coverage was added for Laravel archive upload/download, but full workflow E2E
coverage is still missing for several product areas.

Flows still without meaningful E2E coverage:
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

1. Add rollback companions for older active Supabase migrations.
2. Expand backend feature tests for manpower, KPI approval state machines, PIP transitions,
   validation failures, delete edge cases, and settings bulk update atomicity.
3. Add Playwright specs for employee CRUD, training records, manpower, payroll import, real archive
   workspace download, and role guardrails.
4. Implement the external e-signature workflow for archived documents.
5. Run production-like payroll import QA and live notification-provider QA.
