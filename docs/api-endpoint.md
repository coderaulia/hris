# API Endpoint Notes

Last updated: 2026-04-09

## Runtime Model

- No custom backend API
- Frontend talks directly to Supabase with `@supabase/supabase-js`
- Static health check only: `/healthz.json`

## Supabase Data Surface

- Settings: `app_settings`
- Employees: `employees`, `employee_assessments`, `employee_assessment_scores`, `employee_assessment_history`, `employee_training_records`
- KPI: `kpi_definitions`, `kpi_definition_versions`, `employee_kpi_target_versions`, `kpi_records`, `employee_performance_scores`, `kpi_weight_profiles`, `kpi_weight_items`
- Probation/PIP: `probation_reviews`, `probation_qualitative_items`, `probation_monthly_scores`, `probation_attendance_records`, `pip_plans`, `pip_actions`
- Admin: `admin_activity_log`, `competency_config`

## Guardrails

- RLS is required, but not sufficient on its own
- Data API grants for `anon` and `authenticated` are now validated in CI
- Fresh environments must be bootstrapped with `complete-setup.sql` and then all numbered migrations
