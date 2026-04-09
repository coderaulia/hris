# Fresh Supabase Setup

Use this when you are starting with a brand-new Supabase project and want a working demo dataset for the HR app.

## Run Order

Run these SQL files in Supabase SQL Editor in this exact order:

1. [complete-setup.sql](/c:/Users/Administrator/Documents/hris-vanaila/complete-setup.sql)
2. [migrations/20260307_safe_next_steps.sql](/c:/Users/Administrator/Documents/hris-vanaila/migrations/20260307_safe_next_steps.sql)
3. [migrations/20260308_probation_monthly_attendance.sql](/c:/Users/Administrator/Documents/hris-vanaila/migrations/20260308_probation_monthly_attendance.sql)
4. [migrations/20260308_probation_hr_access_policy.sql](/c:/Users/Administrator/Documents/hris-vanaila/migrations/20260308_probation_hr_access_policy.sql)
5. [migrations/20260308_manager_kpi_competency_policy.sql](/c:/Users/Administrator/Documents/hris-vanaila/migrations/20260308_manager_kpi_competency_policy.sql)
6. [migrations/20260308_director_role_scope.sql](/c:/Users/Administrator/Documents/hris-vanaila/migrations/20260308_director_role_scope.sql)
7. [migrations/20260308_kpi_governance.sql](/c:/Users/Administrator/Documents/hris-vanaila/migrations/20260308_kpi_governance.sql)
8. [migrations/20260309_security_qa_hardening.sql](/c:/Users/Administrator/Documents/hris-vanaila/migrations/20260309_security_qa_hardening.sql)
9. [supabase/01_dummy_seed.sql](/c:/Users/Administrator/Documents/hris-vanaila/supabase/01_dummy_seed.sql)

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

The SQL seed prepares `employees.auth_email`, but it does not create Supabase Auth users.

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

## Recommended First Login

1. Create the auth user for `superadmin@demo.local`
2. Sign into the app with that account
3. Open Settings and confirm branding, org setup, and users are visible
4. Then create the remaining auth users only if you want to test role-specific flows
