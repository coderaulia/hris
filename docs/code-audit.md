# Code Audit

Updated: 2026-05-07

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

## High Priority Findings

No remaining high priority code findings from this audit batch.

## Medium Priority Findings

### Multi-row save paths only persist the first row

Two data helpers normalize arrays but send only the first row to the backend:

- `src/modules/data/probation.js`: `saveProbationMonthlyScores()` calls `backend.probation.saveMonthlyScore(normalized[0])`.
- `src/modules/data/pip.js`: `savePipActions()` calls `backend.pip.saveAction(rows[0])`.

Impact:

- Probation month 2/3 score rows can be dropped.
- Additional PIP action rows can be dropped.

### Default module config and tests disagree

`src/config/app-modules.js` requires only `core`, `dashboard`, `employees`, and `kpi` by default. `Assessment Queue` is gated behind the optional `assessment` module in `src/config/module-navigation.js`.

Current failing test:

- `tests/auth.spec.js` expects manager navigation to contain `Assessment Queue`.

Fix options:

- Enable `assessment` for the relevant test environment, or
- Update the test expectation to match the default module set, or
- Make `assessment` a required module if it is truly part of the core product.

### Backend test coverage is placeholder-only

`backend/tests/Feature/ExampleTest.php` only checks `/` returns 200. `backend/tests/Unit/ExampleTest.php` only checks `true`.

Missing backend coverage:

- employee/manager/superadmin scope enforcement
- adapter parity for Laravel endpoints
- destructive actions such as delete/archive flows
- validation and authorization failure cases

## Missing Features

These are known product gaps confirmed by the current docs and code shape:

- Persistent archive table/storage flow for generated HR documents
- Full e-signature workflow or approval-sign sequence for generated documents
- Production notification provider configuration for live outbound delivery
- Production-like payroll import QA with real employee IDs and payslip PDF verification
- Rollback-script discipline for migrations, as expected by `claude.md`
- Further bundle work for large vendor chunks, especially `pdf-vendor`

## Suggested Fix Order

1. Done - port and extend the remote Laravel authorization scoping fix.
2. Done - close Laravel adapter parity gaps for KPI definition/version/target/weight/delete flows.
3. Fix probation and PIP bulk-save behavior.
4. Decide whether assessment is default product scope, then align module config and tests.
5. Add real backend feature tests for scoped reads/writes.
6. Continue missing-feature work from HR document archive and e-signature workflows.
