# Code Audit

Updated: 2026-05-08

This document captures the current code flaws and missing features found during the latest local audit. Keep this page focused on actionable implementation gaps; keep broad delivery status in `docs/project-status.md`.

## Verification Snapshot

- `npm run build`: passed on 2026-05-08
- `npm run qa:hardening`: passed on 2026-05-08
- `npx playwright test tests/backend-adapter.spec.js`: passed on 2026-05-08, including KPI governance and HR document archive adapter routes
- Laravel feature tests were added, but `php` and `composer` were not available on PATH in the local shell for this verification pass
- `npx playwright test tests/auth.spec.js --max-failures=1`: previously failed at login with invalid seeded manager credentials before reaching the navigation assertion
- Full Playwright suite remains inconclusive from the prior audit batch

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

### Backend test coverage now has scoped smoke tests

Fixed locally on 2026-05-08:

- Added Laravel feature tests for employee/manager/HR scope enforcement, assessment list scoping, probation write authorization, HR document archive creation, and archive signature sequencing.
- `backend/app/Http/Controllers/Assessment/AssessmentController.php` now uses the shared `EmployeeScopeService::scopeQuery()` path for assessment list reads.

### HR document archive and signature foundation

Fixed locally on 2026-05-08:

- Added `migrations/20260508_hr_document_archives.sql` for generated-document archive metadata, storage path status, and company/recipient signature workflow state.
- Added `migrations/20260508_hr_document_archive_storage.sql` for the private `hr-document-archives` Supabase Storage bucket and file policies.
- Added Supabase and Laravel adapter methods for listing/saving archives and updating signature status.
- Added Supabase/Laravel archive file upload methods so generated PDFs can be stored after export.
- Added Laravel archive endpoints and resources for `/hr-document-archives`, `/hr-document-archives/{id}/file`, and `/hr-document-archives/{id}/signature`.
- The HR Documents workspace now saves archive metadata plus the PDF file after export and shows recent archives with internal company/recipient sign actions.

### Controller mass-assignment risk fixed

Fixed locally on 2026-05-08:

Added `$request->validate()` blocks to all write actions that previously passed `$request->all()` directly to `updateOrCreate`:

- `backend/app/Http/Controllers/ManpowerController.php` — `storePlan`, `storeRequest`, `storePipeline` now validate field types, regex formats (`period`), enum values (`status`, `priority`, `approval_status`, `stage`), and foreign key existence.
- `backend/app/Http/Controllers/ProbationController.php` — `storeReview`, `storeMonthlyScore`, `storeAttendance` now validate employee_id, review FK, month_no range, date formats, and numeric constraints.
- `backend/app/Http/Controllers/PipController.php` — `store` and `storeAction` now validate employee_id, plan FK, action_title, status enum, and progress_pct range.
- `backend/app/Http/Controllers/HrDocumentController.php` — `storeTemplate` now validates document_type, template_name, status enum, version_no, and all JSON fields as arrays.

### Dashboard module now routes through adapter

Fixed locally on 2026-05-08:

- Added `dashboard` namespace to `src/lib/backends/supabase-adapter.js` with `fetchSummary`, `fetchProbationExpiry`, `fetchAssessmentCoverage` reading the three Postgres views.
- Added `dashboard` namespace to `src/lib/backends/laravel-adapter.js` calling new `GET /dashboard/summary`, `GET /dashboard/probation-expiry`, and `GET /dashboard/assessment-coverage` routes.
- Added `backend/app/Http/Controllers/DashboardController.php` querying the views via `DB::select`.
- Routes registered in `backend/routes/api.php`.
- `src/modules/data/dashboard.js` now calls `backend.dashboard.*` — works in both Supabase and Laravel mode.

### Adapter asymmetry fixed — kpis.listWeightItems

Fixed locally on 2026-05-08:

- Added `GET /kpi-weight-items` route in `backend/routes/api.php`.
- Added `KpiController::weightItems()` returning `KpiWeightItem::all()` as a flat collection.
- `laravel-adapter.js` `listWeightItems` now calls `/kpi-weight-items` directly, matching the Supabase adapter response shape.

### PerformanceScoreController now uses shared scoping

Fixed locally on 2026-05-08:

`PerformanceScoreController::index()` now delegates to `EmployeeScopeService::scopeQuery()`, giving HR and superadmin full read access consistent with all other scoped controllers.

### API endpoint docs and db-schema.md updated

Fixed locally on 2026-05-08:

- `docs/api-endpoints.md`: added Dashboard section, `GET /kpi-weight-items`, and all three `hr-document-archive` routes.
- `docs/db-schema.md`: added Dashboard Views section and `hr_document_archives` table entry.

## Medium Priority Findings

### No migration rollback scripts

All 13 migration files in `migrations/` are additive only. None has a paired rollback script. `CLAUDE.md` explicitly requires rollback-script discipline.

Affected migrations (in creation order):
- `20260307_performance_foundation.sql`
- `20260308_kpi_governance.sql`
- `20260308_probation_workflow.sql`
- `20260308_role_scope_access.sql`
- `20260309_security_qa_hardening.sql`
- `20260408_data_api_grants.sql`
- `20260409_dashboard_server_views.sql`
- `20260409_drop_legacy_employee_assessment_columns.sql`
- `20260409_manpower_planning.sql`
- `20260417_hr_documents_foundation.sql`
- `20260429_hr_payroll_records.sql`
- `20260508_hr_document_archives.sql`
- `20260508_hr_document_archive_storage.sql`

Rollback scripts should live as `migrations/YYYYMMDD_description_rollback.sql`. New migrations must ship with a paired rollback.

### Backend feature test coverage gaps

Current feature tests (`ScopedAccessTest.php`, `HrDocumentArchiveTest.php`) cover scoped reads, probation writes, archive creation, and signature sequencing.

Not yet covered:
- Manpower plan/request/pipeline CRUD and scope enforcement
- Training record CRUD (create, update, delete) and scoping
- KPI definition/version/target version approval state machine transitions
- KPI weight profile and item save paths
- Performance score list scoping for HR and superadmin (now uses shared scopeQuery — needs regression test)
- PIP action status transitions
- All validation failure cases (422 responses) across controllers with the newly-added validate blocks
- Delete operations and orphaned-record edge cases
- Settings bulk update atomicity

### Playwright E2E coverage gaps

Eight specs exist (`auth`, `assessment`, `kpi-approval`, `probation`, `hr-documents`, `backend-adapter`, `stress-workload`, `live-schema-smoke`).

Flows without any Playwright coverage:
- Employee CRUD (create, update, delete single and bulk)
- Training records management
- Manpower planning request approval and pipeline card management
- Settings and competency configuration changes
- Payroll CSV import and reconciliation
- HR document archive listing, file download, and signature actions
- Role-based access guardrails (superadmin vs HR vs manager vs employee visible routes)

## Missing Features

These are known product gaps confirmed by the current docs and code shape:

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
6. Done - add HR document archive metadata, private PDF storage, and internal signature status flow; external e-sign delivery remains tracked as a remaining missing feature.
7. Done - add `$request->validate()` blocks to ManpowerController, ProbationController, PipController, and HrDocumentController template upsert.
8. Done - add dashboard adapter namespace and Laravel routes; dashboard.js now works in Laravel mode.
9. Done - add flat `/kpi-weight-items` Laravel route; adapter asymmetry resolved.
10. Done - apply `EmployeeScopeService` HR/superadmin bypass to `PerformanceScoreController::index()`.
11. Done - document the two missing archive routes in `docs/api-endpoints.md` and three dashboard views in `docs/db-schema.md`.
12. Write rollback scripts for all 13 existing migrations; enforce pairing rule for new migrations.
13. Expand backend feature tests: manpower, training, KPI state machine, PIP transitions, new validation failure cases, delete edge cases.
14. Add Playwright specs for employee CRUD, training, manpower, payroll import, and HR document archive/signature flows.
