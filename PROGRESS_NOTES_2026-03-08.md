# Progress Notes - 2026-03-08

## Scope Completed
- Probation review form improvements:
  - wider modal and wider qualitative/note columns
  - manager scoring hints
  - pass threshold validation for `Pass` decision
- Probation export improvements:
  - print-ready PDF export with signature blocks (Employee, Manager, Director)
  - generated date shown on report
  - KPI detail annex page to explain monthly Work score basis (target vs actual vs achievement)
  - recap block wrapped to avoid clipping on long text
- Probation persistence robustness:
  - fallback local state persistence for monthly scores/attendance when migration tables are missing
  - non-empty export fallback for qualitative/notes when summary exists
- UI/flow updates:
  - explicit PIP threshold and probation pass-min controls in Probation & PIP header
  - report refresh behavior improved for active Records sub-view
- Manual updates:
  - KPI record/edit flow
  - monthly target config
  - probation & PIP process

## Error Checks Run
- `node --check src/main.js`
- `node --check src/modules/data.js`
- `node --check src/modules/records.js`
- `node --check src/modules/settings.js`
- `npm run build`

Result: passed.

## Security Review Notes (Static)
- Checked for dangerous patterns in touched modules (`eval`, `new Function`, direct HTML insertion hotspots).
- No direct high-risk code paths introduced in this batch.
- Dynamic table/html rendering in touched modules continues to use `escapeHTML` / `escapeInlineArg` in user-facing interpolations.
- Supabase writes use query-builder APIs (no raw SQL construction in frontend code).

## Residual / Operational Notes
- For permanent probation monthly qualitative/attendance persistence, ensure DB migrations are applied:
  - `migrations/20260308_probation_monthly_attendance.sql`
  - `migrations/20260308_probation_hr_access_policy.sql`
- If migrations are not applied, app currently falls back to local in-memory state for monthly probation rows.

## Sprint 4: KPI Governance (Added)
- Added KPI governance schema and flow:
  - effective-month KPI definition changes
  - optional HR approval gate for manager KPI changes (`kpi_hr_approval_required`)
  - version history tables for KPI definitions and employee monthly targets
- Added non-retroactive KPI scoring protection:
  - snapshot fields saved into `kpi_records` (target, KPI name/unit/category, version references)
  - dashboard/records/probation exports now resolve KPI values snapshot-first
- Added governance UI in Settings:
  - governance toggle
  - pending approvals panel
  - version history panel

## Sprint 4 SQL Dependencies
- `migrations/20260308_director_role_scope.sql`
- `migrations/20260308_kpi_governance.sql`
