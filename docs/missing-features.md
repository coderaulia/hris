# Missing Features

Known product gaps confirmed by current docs and code shape.

## E-Signature Workflow

**Current state:** No signing or approval step exists after document generation.

**Needed:**
- Signature request model linking an archived document to signers (employee, manager, HR) with
  status `pending | signed | declined`.
- Signer UX: notification → review → sign (drawn/typed, stored as base64) → attached to archive row.
- Status tracking visible in the HR Documents workspace.

**Depends on:** HR Document Archive — signatures attach to archive rows.

**Touch:** new `hr_document_signatures` table/migration, `src/modules/documents.js`,
`supabase/functions/approval-notifications/` for signer dispatch.

## Production Notification Provider

**Current state:** `supabase/functions/approval-notifications/index.ts:95–101` reads
`EMAIL_PROVIDER`, `EMAIL_API_URL`, `EMAIL_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO` from env.
Missing secrets → logs `"unconfigured"` and skips delivery. `resend` is the named production
provider. Frontend dispatch is wired for KPI definition submissions/decisions, KPI target
submissions/decisions, probation decisions, and PIP create/status updates.

**Needed:** Set secrets in Supabase dashboard (`EMAIL_PROVIDER=resend`, `EMAIL_API_KEY`,
`EMAIL_FROM`, optional `EMAIL_REPLY_TO`). Run `npm run qa:notifications` with real row IDs for
dry-run recipient resolution, then `npm run qa:notifications -- --live` to verify delivery for
KPI definition, KPI target, probation review, and PIP notifications.

## Payroll Import QA

**Current state:** `importPayrollRecords` upserts rows keyed by `(employee_id, payroll_period)`.
Both adapter paths are implemented. CSV import now rejects missing `employee_id`, malformed
`payroll_period`, malformed cutoff dates, and non-numeric amounts before saving. Laravel API
import validates the same required shape server-side. No QA run against production-like data.

**Needed:** QA with real employee IDs. Verify payslip PDF output against imported rows. Confirm
upsert idempotency against Supabase and Laravel-backed environments.

**Note:** No code change expected unless edge cases surface in `importPayrollRecords` validation
or the payslip template in `pdfTemplates.js`.

## Migration Rollback Scripts

**Current state:** `claude.md` requires paired rollback scripts. Thirteen Supabase migration files in
`migrations/` (oldest `20260307`, newest `20260508_hr_document_archive_storage`) and Laravel
migrations in `backend/database/migrations/` have no companion rollback SQL. Laravel `down()`
methods only cover `dropIfExists` on self-created tables.

**Needed:** Companion `YYYYMMDD_description.rollback.sql` for each Supabase migration reversing
added columns, dropped columns, and RLS policy changes. Complete Laravel `down()` methods.
Rollback procedure documented in `docs/`. All future migrations must ship with a paired rollback
before merge.

## E2E Playwright Coverage Gaps

**Current state:** Eight specs cover auth, assessment, KPI approval, probation/PIP, HR documents,
backend adapter routing, stress workload, and live schema smoke. Large functional areas have no
E2E coverage.

**Missing flows:**
- Employee CRUD (create, update, delete single and bulk)
- Training records management
- Manpower plan/request approval and pipeline card management
- Settings and competency configuration changes
- Payroll CSV import and reconciliation
- HR document archive listing, file download, and signature actions
- Role-based access guardrails (what each role can and cannot see/do)

**Touch:** new or extended specs under `tests/`, seed data adjustments in
`tests/support/` if needed.

## Backend Feature Test Coverage Gaps

**Current state:** `ScopedAccessTest.php` covers employee/manager/HR scope, assessment
scoping, and probation write authorization. `HrDocumentArchiveTest.php` covers archive creation
and signature sequencing. `ExampleTest.php` is a placeholder only.

**Missing coverage:**
- Manpower plan/request/pipeline CRUD and scope enforcement
- Training record CRUD and authorization
- KPI definition/version/target version approval state machine (full cycle: create → pending →
  approved/rejected → re-submit paths)
- KPI weight profile and weight item save paths
- Performance score list scoping for HR and superadmin roles
- PIP action status transitions
- Validation failure responses (422) across ManpowerController, ProbationController, PipController, HrDocumentController (validate blocks added 2026-05-08, no tests yet)
- Delete operations and orphaned-record edge cases
- Settings bulk update atomicity

**Touch:** new `Feature/` test classes under `backend/tests/Feature/`, extending
`BuildsHrisTestSchema` for consistent test DB setup.

## Bundle Size: pdf-vendor

**Current state:** `vite.config.js:26` puts `jspdf` + `html2canvas` in one `pdf-vendor` chunk.
`documents.js:2637` already dynamic-imports `pdfTemplates.js`, but chunk size is unverified.

**Needed:** Measure with `npx vite-bundle-visualizer`. If `html2canvas` is unused in production
paths, remove it. Confirm dynamic import prevents eager load of the PDF chunk.

**Touch:** `vite.config.js`, `src/lib/pdfTemplates.js`, `src/modules/documents.js`.
