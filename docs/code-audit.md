# Code Audit

Updated: 2026-05-07

This document captures the current code flaws and missing features found during the latest local audit. Keep this page focused on actionable implementation gaps; keep broad delivery status in `docs/project-status.md`.

## Verification Snapshot

- `npm run build`: passed
- `npm run qa:hardening`: passed
- `npx playwright test tests/backend-adapter.spec.js`: passed
- `composer test` in `backend/`: passed
- PHP syntax check for touched Laravel controllers/services: passed
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

## High Priority Findings

### Laravel adapter is not feature-complete

The docs describe the app as fully abstracted behind `src/lib/backend.js`, but several feature data paths still call Supabase directly. Laravel mode does not expose matching routes for these flows yet.

Affected KPI flows in `src/modules/data/kpi.js` include:

- KPI definition version creation and decision updates
- KPI definition deletion
- employee KPI target version creation and approval decisions
- KPI weight profile and item saves
- KPI record deletion

The Laravel API currently exposes only basic KPI list, KPI record save/list, weight profile list, and performance score routes in `backend/routes/api.php`.

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
2. Close Laravel adapter parity gaps for KPI definition/version/target/weight/delete flows.
3. Fix probation and PIP bulk-save behavior.
4. Decide whether assessment is default product scope, then align module config and tests.
5. Add real backend feature tests for scoped reads/writes.
6. Continue missing-feature work from HR document archive and e-signature workflows.
