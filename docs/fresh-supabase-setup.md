# Fresh Supabase Setup

Use this guide for a brand-new Supabase project when you want a working demo environment for the HR app.

## Run Order

Run these SQL files in Supabase SQL Editor in this exact order:

1. [complete-setup.sql](/D:/web/hris/complete-setup.sql)
2. [20260307_safe_next_steps.sql](/D:/web/hris/migrations/20260307_safe_next_steps.sql)
3. [20260308_probation_monthly_attendance.sql](/D:/web/hris/migrations/20260308_probation_monthly_attendance.sql)
4. [20260308_probation_hr_access_policy.sql](/D:/web/hris/migrations/20260308_probation_hr_access_policy.sql)
5. [20260308_manager_kpi_competency_policy.sql](/D:/web/hris/migrations/20260308_manager_kpi_competency_policy.sql)
6. [20260308_director_role_scope.sql](/D:/web/hris/migrations/20260308_director_role_scope.sql)
7. [20260308_kpi_governance.sql](/D:/web/hris/migrations/20260308_kpi_governance.sql)
8. [20260309_security_qa_hardening.sql](/D:/web/hris/migrations/20260309_security_qa_hardening.sql)
9. [20260408_data_api_grants.sql](/D:/web/hris/migrations/20260408_data_api_grants.sql)
10. [01_dummy_seed.sql](/D:/web/hris/supabase/01_dummy_seed.sql)

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
3. Deploy Edge Functions using [docs/supabase-functions-deploy.md](/D:/web/hris/docs/supabase-functions-deploy.md) if you need managed users, auth callback normalization, notifications, or server-side exports
