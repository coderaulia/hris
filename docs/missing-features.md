# Missing Features

Known product gaps confirmed by current docs and code shape.

## E-Signature Workflow

**Current state:** HR Documents can render signer placeholders, export generated PDFs, and archive
files in both Supabase and Laravel modes. There is no request-to-sign workflow, signer inbox,
signature capture, or signed/declined state. The archive table currently stores metadata and
`storage_path`; it does not include signature status columns.

**Needed:**
- Signature request model linking an archived document to signers (employee, manager, HR) with
  status `pending | signed | declined`.
- Signer UX: notification -> review -> sign (drawn/typed/uploaded, stored securely) -> attach to
  archive row or companion signature row.
- Status tracking visible in the HR Documents archive workspace.
- Backend parity for Supabase and Laravel before wiring the frontend actions.

**Depends on:** HR Document Archive metadata and file storage.

**Touch:** new signature table/migration, rollback script, `src/modules/documents.js`,
`src/modules/data/hr-documents.js`, both backend adapters, `HrDocumentController`, and
`supabase/functions/approval-notifications/` for signer dispatch.

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
Laravel archive upload/download routing, but large functional areas still have no E2E coverage.

**Missing flows:**
- Employee CRUD (create, update, delete single and bulk)
- Training records management
- Manpower plan/request approval and pipeline card management
- Settings and competency configuration changes
- Payroll CSV import and reconciliation
- HR document archive listing and file download through the real workspace in both backend modes
- HR document signature actions once implemented
- Role-based access guardrails (what each role can and cannot see/do)

**Touch:** new or extended specs under `tests/`, seed data adjustments in `tests/support/` if
needed.

## Backend Feature Test Coverage Gaps

**Current state:** Feature tests now cover probation read/write scope, KPI definition/KPI record
authorization basics, scoped assessment/training reads, performance score creation, employee role
validation, HR document archive create/upload/download/delete, manpower plan/request/pipeline
authorization, KPI definition/target approval paths, KPI weight profile/item saves, PIP action
transitions, selected validation failures, and settings bulk update authorization/validation. A
Laravel parity migration was added for app settings, manpower, PIP, and richer KPI governance fields
needed by those controller paths. Unit tests cover a small part of `EmployeeScopeService`. The
Laravel tests were not run locally because `php` and `composer` were not available on PATH.

**Recently done on 2026-05-09:**
- Added `backend/database/migrations/2026_05_09_000000_add_laravel_workflow_parity_tables.php`.
- Wrapped `AppSettingController::bulkUpdate()` in a transaction.
- Added Laravel feature tests for manpower, KPI workflow, PIP workflow, and settings bulk updates.

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
