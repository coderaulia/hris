# Refactor Module Map

## Records Module

- Entry facade: `src/modules/records.js`
- Legacy implementation host (phase-1): `src/modules/records/core.js`
- Feature entry points:
  - `src/modules/records/reportView.js`: records table + assessment report open/search/edit/delete
  - `src/modules/records/trainingLog.js`: training history CRUD + approval flow
  - `src/modules/records/probationView.js`: probation/PIP dashboard tab rendering
  - `src/modules/records/probationActions.js`: probation draft/review/attendance actions
  - `src/modules/records/probationExport.js`: probation PDF/Excel export
  - `src/modules/records/pipActions.js`: PIP generation + status update

## Dashboard Module

- Entry facade: `src/modules/dashboard.js`
- Legacy implementation host (phase-1): `src/modules/dashboard/core.js`
- Feature entry points:
  - `src/modules/dashboard/assessmentSummary.js`: assessment cards + charts
  - `src/modules/dashboard/kpiSummary.js`: KPI summary + leaderboard + department cards
  - `src/modules/dashboard/deptModal.js`: department drill-down modal, trend chart, and filtering
  - `src/modules/dashboard/deptExport.js`: department/employee KPI export (Excel/PDF)
  - `src/modules/dashboard/charts.js`: shared chart-class/status helper bridge
  - `src/modules/dashboard/shared.js`: shared KPI record metadata + employee-id normalization
  - `src/modules/dashboard/deptContext.js`: department modal/export state shared across dashboard slices

## Shared UI Contracts

- `src/lib/uiContracts.js`
  - DOM selectors used across modules
  - score/status labels and class maps
  - score band helper functions

## KPI Governance Data

- `src/modules/data/kpi.js`
  - KPI definition versioning (`kpi_definition_versions`)
  - Employee KPI monthly target versioning (`employee_kpi_target_versions`)
  - HR approval/rejection flow for pending KPI changes
  - KPI record snapshot save (`target_snapshot`, KPI name/unit/category snapshot)
- `src/modules/data/targets.js`
  - Effective-month KPI definition resolution
  - Effective-month employee target resolution
  - Snapshot-aware KPI target resolver for reports/charts

## Next Internal Refactor Step

- Move feature logic out of `records/core.js` into the corresponding `records/*` files incrementally.
- Continue moving feature logic out of `dashboard/core.js` into `dashboard/*` files incrementally.
- Department modal/export logic now lives in `dashboard/deptModal.js` and `dashboard/deptExport.js`; the next dashboard candidate is `renderKpiSummary` and related leadership analytics.
- Keep facades stable so existing app wiring remains unchanged.
