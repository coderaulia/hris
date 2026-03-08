# Refactor Smoke Checklist

Use this checklist after module-splitting changes to verify no behavior regression.

## Build Gate

- Run `npm run build` and confirm success.
- Confirm no new runtime import errors in browser console.

## Core App Flow

1. Login as superadmin.
2. Open Dashboard, Employees, Assessment & KPI, Records, Settings.
3. Confirm header/company branding still loads from settings.

## Data Flow Checks

1. Employees:
- Create/update an employee.
- Confirm assessment/training history persists.

2. KPI:
- Create KPI definition with effective month.
- Edit existing KPI definition and confirm new version appears in KPI Version History.
- Toggle KPI governance approval setting (HR/Superadmin).
- As manager, submit KPI definition or target change and verify pending approval state when enabled.
- As HR/Superadmin, approve and reject pending KPI changes.
- Insert KPI record and confirm weighted score updates.
- Change KPI target/definition after record exists, then confirm old KPI record still uses snapshot values.
- Delete KPI record and confirm score re-calculates.

3. Probation:
- Generate probation draft.
- Save monthly qualitative text.
- Save attendance entry and verify attitude deduction updates.
- Export probation report (PDF/Excel).

4. PIP:
- Create a PIP plan.
- Add action items and reload page to verify persistence.

## Role Checks

1. Manager account:
- Edit KPI/competency definitions only for scoped positions.
- Edit KPI monthly targets only for scoped employees.
- Access records limited to team scope.

2. HR account:
- Can review probation and attendance entries.
- Can approve/reject pending KPI governance changes.

3. Employee account:
- No manager/superadmin admin panels visible.

## SQL Dependencies

- `public.probation_monthly_scores` exists.
- `public.probation_attendance_records` exists.
- `public.kpi_definition_versions` exists.
- `public.employee_kpi_target_versions` exists.
- `public.kpi_records` has snapshot columns (`target_snapshot`, `kpi_name_snapshot`, `kpi_unit_snapshot`, `kpi_category_snapshot`).
- App setting key `kpi_hr_approval_required` exists.
- RLS policies still allow expected reads/writes per role.

## Module Wiring Checks

- `records.js` exports resolve from `src/modules/records/*` feature entry points.
- `dashboard.js` exports resolve from `src/modules/dashboard/*` feature entry points.
- `uiContracts.js` imports are valid in both `records/core.js` and `dashboard/core.js`.
