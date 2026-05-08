# Code Audit

Updated: 2026-05-08

This document captures the current code flaws and missing features found during the latest local audit. Keep this page focused on actionable implementation gaps; keep broad delivery status in `docs/project-status.md`.

## Verification Snapshot

- `npm run build`: passed
- `npm run qa:hardening`: passed
- `npx playwright test tests/backend-adapter.spec.js`: passed, including KPI governance adapter routes
- `composer test` in `backend/`: passed
- PHP syntax check for touched Laravel controllers/services: passed
- `php artisan route:list --path=api/v1` in `backend/`: passed
- `npx playwright test tests/auth.spec.js --max-failures=1`: failed
- Full Playwright suite: started but stopped after several minutes without useful progress output, so it is inconclusive

## Resolved Findings

### Laravel API scoping gaps

Fixed locally on 2026-05-07:

- `backend/app/Services/EmployeeScopeService.php` now handles `hr` and director operational scope in addition to employee/manager/superadmin access.
- `backend/app/Http/Controllers/Assessment/AssessmentController.php` scopes score and history reads.
- `backend/app/Http/Controllers/ManpowerController.php` scopes plan, request, and pipeline reads and guards write/delete actions by role.
- `backend/app/Http/Controllers/ProbationController.php` scopes review, monthly score, and attendance reads and guards writes by role plus employee scope.
- `backend/app/Http/Controllers/PipController.php` scopes plan/action reads and guards writes by role plus employee scope.

Note: the remote `origin/chore/cleanup-legacy-unused-docs` scoping commit was reviewed, but only the relevant controller behavior was ported locally; unrelated legacy deletions/docs changes were not pulled into this fix.

### Laravel adapter is not feature-complete

Fixed locally on 2026-05-07:

- `src/modules/data/kpi.js` now routes KPI governance operations through `backend.kpis.*` instead of calling Supabase directly.
- `src/lib/backends/supabase-adapter.js` and `src/lib/backends/laravel-adapter.js` now expose matching methods for KPI definition, definition version, employee target version, weight profile/item, KPI record save, and KPI record delete flows.
- `backend/app/Http/Controllers/KpiController.php` now exposes Laravel routes for KPI definition create/delete, definition version list/create/decision, target version list/create/decision, weight profile/item saves, and KPI record delete.
- Added Laravel models/resources for `kpi_definition_versions` and `employee_kpi_target_versions`.
- `tests/backend-adapter.spec.js` now verifies Laravel KPI governance adapter routing.

### Multi-row save paths now persist all rows

Fixed locally on 2026-05-08:

- `src/modules/data/probation.js`: `saveProbationMonthlyScores()` now saves each normalized monthly score row and keeps all saved rows in local state.
- `src/modules/data/pip.js`: `savePipActions()` now saves each normalized action row and keeps all saved rows in local state.

### Default module config and tests now align

Fixed locally on 2026-05-08:

- `src/config/app-modules.js` now includes `assessment` in the required default module set, matching the documented product scope and `tests/auth.spec.js` manager navigation expectation for `Assessment Queue`.

## High Priority Findings

No remaining high priority code findings from this audit batch.

## Medium Priority Findings

### Backend test coverage now has scoped smoke tests

Fixed locally on 2026-05-08:

- Added Laravel feature tests for employee/manager/HR scope enforcement, assessment list scoping, probation write authorization, HR document archive creation, and archive signature sequencing.
- `backend/app/Http/Controllers/Assessment/AssessmentController.php` now uses the shared `EmployeeScopeService::scopeQuery()` path for assessment list reads.

Remaining backend test gaps:

- broader adapter parity for every Laravel endpoint
- destructive delete/archive edge cases beyond HR document archive creation
- deeper validation failure cases across controllers

### HR document archive and signature foundation

Fixed locally on 2026-05-08:

- Added `migrations/20260508_hr_document_archives.sql` for generated-document archive metadata, storage path status, and company/recipient signature workflow state.
- Added Supabase and Laravel adapter methods for listing/saving archives and updating signature status.
- Added Laravel archive endpoints and resources for `/hr-document-archives` and `/hr-document-archives/{id}/signature`.
- The HR Documents workspace now saves archive metadata after PDF export and shows recent archives with internal company/recipient sign actions.

## Missing Features

These are known product gaps confirmed by the current docs and code shape:

- Private file-bucket storage for archived generated HR document PDFs (archive metadata now exists)
- External e-signature delivery/provider workflow for generated documents (internal sign status now exists)
- Production notification provider configuration for live outbound delivery
- Production-like payroll import QA with real employee IDs and payslip PDF verification
- Rollback-script discipline for migrations, as expected by `claude.md`
- Further bundle work for large vendor chunks, especially `pdf-vendor`

## Suggested Fix Order

1. Done - port and extend the remote Laravel authorization scoping fix.
2. Done - close Laravel adapter parity gaps for KPI definition/version/target/weight/delete flows.
3. Done - fix probation and PIP bulk-save behavior.
4. Done - make assessment part of default product scope and align module config/tests.
5. Done - add real backend feature tests for scoped reads/writes and HR document archive/signature behavior.
6. In progress - add HR document archive metadata and internal signature status flow; private file storage and external e-sign delivery remain open.
