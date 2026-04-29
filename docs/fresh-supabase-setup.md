# Fresh Supabase Setup

Use this guide for a brand-new Supabase project when you want a clean working demo environment for the HR app.

## Fresh Install Rule

For a brand-new project:

1. start with [complete-setup.sql](/D:/web/hris/complete-setup.sql)
2. then run only the active migrations below
3. finish with [01_dummy_seed.sql](/D:/web/hris/supabase/01_dummy_seed.sql)

Do not use files inside [migrations/archive](/D:/web/hris/migrations/archive) for a normal fresh install.

## Run Order

Run these SQL files in Supabase SQL Editor in this exact order:

1. [complete-setup.sql](/D:/web/hris/complete-setup.sql)
2. [20260307_performance_foundation.sql](/D:/web/hris/migrations/20260307_performance_foundation.sql)
3. [20260308_probation_workflow.sql](/D:/web/hris/migrations/20260308_probation_workflow.sql)
4. [20260308_role_scope_access.sql](/D:/web/hris/migrations/20260308_role_scope_access.sql)
5. [20260308_kpi_governance.sql](/D:/web/hris/migrations/20260308_kpi_governance.sql)
6. [20260309_security_qa_hardening.sql](/D:/web/hris/migrations/20260309_security_qa_hardening.sql)
7. [20260408_data_api_grants.sql](/D:/web/hris/migrations/20260408_data_api_grants.sql)
8. [20260409_drop_legacy_employee_assessment_columns.sql](/D:/web/hris/migrations/20260409_drop_legacy_employee_assessment_columns.sql)
9. [20260409_manpower_planning.sql](/D:/web/hris/migrations/20260409_manpower_planning.sql)
10. [20260409_dashboard_server_views.sql](/D:/web/hris/migrations/20260409_dashboard_server_views.sql)
11. [20260417_hr_documents_foundation.sql](/D:/web/hris/migrations/20260417_hr_documents_foundation.sql)
12. [20260429_hr_payroll_records.sql](/D:/web/hris/migrations/20260429_hr_payroll_records.sql)
13. [01_dummy_seed.sql](/D:/web/hris/supabase/01_dummy_seed.sql)

## Migration Notes

- The main [migrations](/D:/web/hris/migrations) folder now contains only the active upgrade chain.
- Older split migrations and one-off repair/bootstrap helpers were moved to [migrations/archive](/D:/web/hris/migrations/archive).
- `20260409_drop_legacy_employee_assessment_columns.sql` stays in the fresh path because the frontend now expects assessment and training data from normalized tables, not the old mirror columns on `employees`.
- `20260429_hr_payroll_records.sql` adds reusable employee/month payroll rows for HR Documents payslip CSV import.
- Local bootstrap and QA audit scripts now use this same canonical chain directly, so the documented order and automation are locked together.

## What The Seed Includes

- app settings and org structure
- 9 baseline employees across `superadmin`, `director`, `hr`, `manager`, and `employee`
- 20 additional dummy employees across IT, Sales, Marketing, Operations, HR, and Finance
- competency config for 4 employee positions
- KPI definitions, governed KPI versions, employee KPI target versions, weight profiles, and KPI records
- assessment snapshots, assessment history, and training records
- Jan-Mar 2026 KPI target versions and KPI records for the 20 additional dummy employees
- intentionally empty assessment rows for those 20 additional dummy employees
- one probation case with monthly scores and attendance deductions
- one active PIP plan
- a few activity-log entries

## Important Auth Note

The SQL seed prepares `employees.auth_email`, but it does not create Supabase Auth users. That part still has to be done in Supabase Authentication.

Create these users manually in `Supabase -> Authentication -> Users` if you want to log into the app immediately:

- `superadmin@demo.local`
- `director@demo.local`
- `hr@demo.local`
- `eng.manager@demo.local`
- `sales.manager@demo.local`
- `raka.frontend@demo.local`
- `nia.backend@demo.local`
- `bima.sales@demo.local`
- `tari.ops@demo.local`

After creating each Auth user:

- keep the email exactly the same as the seeded `auth_email`
- you can leave `auth_id` blank in the employee row at first
- the app will auto-link `auth_id` on first successful sign-in
- do not try to manually update `auth_id` unless you intentionally bypass the employee guard trigger

## Recommended First Login

1. Create the auth user for `superadmin@demo.local`
2. Sign into the app with that account
3. Open Settings and confirm branding, org setup, and users are visible
4. Then create the remaining auth users only if you want to test role-specific flows

## After bootstrap

Before using the app locally or in production:

1. Copy [.env.example](/D:/web/hris/.env.example) to `.env`
2. Fill in `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_AUTH_REDIRECT_URL`
3. Deploy Edge Functions using [docs/supabase-functions-deploy.md](/D:/web/hris/docs/supabase-functions-deploy.md) if you need managed users, auth callback normalization, notifications, or server-side exports.

## Alternative: Laravel Backend

If you prefer using a PHP-based API instead of Supabase Edge Functions, you can use the **Laravel Backend** located in the `backend/` directory.

- The Laravel backend connects to the same Supabase Postgres instance.
- It provides a centralized security layer (`EmployeeScopeService`) and replaces the need for some Edge Functions.
- To use it, follow the setup instructions in [backend/README.md](/D:/web/hris/backend/README.md) and set `VITE_BACKEND_TYPE=laravel` in your `.env`.
