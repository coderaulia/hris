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
`migrations/YYYYMMDD_description.rollback.sql`. One rollback exists for
`20260507_hr_document_archive.sql`. Older active Supabase migrations still have no rollback
companions.

**Needed:**
- Add companion rollback scripts for older active forward migrations.
- Keep future migrations paired with rollback scripts before merge.
- Consider rollback-specific docs for operational restore order and environment ownership.

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
validation, and HR document archive create/upload/download/delete. Unit tests cover a small part of
`EmployeeScopeService`. The Laravel tests were not run locally because `php` and `composer` were
not available on PATH.

**Missing coverage:**
- Manpower plan/request/pipeline CRUD and scope enforcement
- KPI definition/version/target version approval state machine (full cycle: create -> pending ->
  approved/rejected -> re-submit paths)
- KPI weight profile and weight item save paths
- PIP action status transitions
- Validation failure responses (422) across write controllers
- Delete operations and orphaned-record edge cases
- Settings bulk update atomicity

**Touch:** new or extended `Feature/` test classes under `backend/tests/Feature/`.
