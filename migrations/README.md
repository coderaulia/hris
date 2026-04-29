# Migrations

This folder now keeps only the active schema upgrade chain for normal project development.

## Active Migrations
- Run these for existing environments in timestamp order.
- Fresh environments should start with [complete-setup.sql](/D:/web/hris/complete-setup.sql) and then run only the migrations listed in [fresh-supabase-setup.md](/D:/web/hris/docs/fresh-supabase-setup.md).
- Current grouped chain:
  - `20260307_performance_foundation.sql`
  - `20260308_probation_workflow.sql`
  - `20260308_role_scope_access.sql`
  - `20260308_kpi_governance.sql`
  - `20260309_security_qa_hardening.sql`
  - `20260408_data_api_grants.sql`
  - `20260409_drop_legacy_employee_assessment_columns.sql`
  - `20260409_manpower_planning.sql`
  - `20260409_dashboard_server_views.sql`
  - `20260417_hr_documents_foundation.sql`
  - `20260429_hr_payroll_records.sql`

## Archived Helpers
One-off helper scripts and superseded split migrations were moved to [archive](/D:/web/hris/migrations/archive):

- `20260307_optional_backfill_legacy.sql`
- `20260307_safe_next_steps.sql`
- `20260308_probation_monthly_attendance.sql`
- `20260308_probation_hr_access_policy.sql`
- `20260308_manager_kpi_competency_policy.sql`
- `20260308_director_role_scope.sql`
- `20260308_probation_monthly_attendance_patch_existing.sql`
- `20260409_employees_bootstrap_base.sql`
- `20260409_manpower_planning_phase1.sql`
- `20260409_manpower_planning_phase2.sql`
- `20260409_manpower_planning_phase3.sql`

These files are kept for reference or edge-case recovery, but they should not be used as part of the standard fresh-project or production-upgrade flow.
