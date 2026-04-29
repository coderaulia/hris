# Database Schema

Updated: 2026-04-29

This is the working schema map for application code and QA. The authoritative SQL remains `complete-setup.sql` plus the canonical migration chain in `scripts/support/canonical-migration-chain.mjs`.

## Bootstrap Rule

Fresh Supabase environments run:

1. `complete-setup.sql`
2. the canonical migrations listed in `docs/fresh-supabase-setup.md`
3. optional seed data from `supabase/01_dummy_seed.sql`

Every released schema change must have a numbered migration under `migrations/`.

## Core Tables

| Table | Purpose | Main Access |
|---|---|---|
| `app_settings` | Branding, org settings, document settings | anon read for bootstrap, authenticated scoped writes |
| `employees` | Employee identity, org role, auth link, document identity fields | RLS scoped by role and employee |
| `admin_activity_log` | Audit trail for admin and document actions | leadership read, app insert |
| `competency_config` | Position competency definitions | manager/HR/superadmin scoped |
| `employee_assessments` | Assessment snapshots | employee scope |
| `employee_assessment_scores` | Assessment score rows | assessment scope |
| `employee_assessment_history` | Assessment history events | employee scope |
| `employee_training_records` | Training log records | employee scope |
| `kpi_definitions` | KPI definition catalog | governed by category scope |
| `kpi_definition_versions` | KPI definition version history | authenticated |
| `employee_kpi_target_versions` | Employee target version history | authenticated |
| `kpi_records` | Monthly KPI values | employee scope |
| `kpi_weight_profiles` | KPI weighting profiles | authenticated read, admin-managed |
| `kpi_weight_items` | KPI weighting items | authenticated read, admin-managed |
| `employee_performance_scores` | Performance score snapshots | employee scope |
| `probation_reviews` | Probation review headers | employee scope |
| `probation_qualitative_items` | Probation qualitative rows | review scope |
| `probation_monthly_scores` | Monthly probation scores | role scoped |
| `probation_attendance_records` | Probation attendance deductions | role scoped |
| `pip_plans` | Performance improvement plans | employee scope |
| `pip_actions` | PIP actions | plan scope |

## Manpower Tables And Views

| Relation | Purpose |
|---|---|
| `manpower_plans` | Planned, approved, and filled headcount rows |
| `headcount_requests` | Manager/HR headcount request workflow |
| `recruitment_pipeline` | Candidate cards linked to approved headcount requests |
| `manpower_plan_overview` | Plan rows with derived gap fields |
| `headcount_request_overview` | Requests with hired and pipeline totals |
| `recruitment_pipeline_overview` | Candidate cards joined with request, owner, urgency, and aging data |

Current optional aggregate views not yet created: `manpower_funnel_summary`, `manpower_gap_by_department`.

## HR Documents Tables

| Table | Purpose |
|---|---|
| `hr_document_templates` | Editable document templates |
| `hr_document_reference_options` | Contract, SP, payroll, and legal reference options |
| `hr_payroll_records` | Reusable employee/month payroll rows for payslip import |

`hr_payroll_records` is created by `migrations/20260429_hr_payroll_records.sql` and is unique by `(employee_id, payroll_period)`.

## Schema Safety Rules

- Verify table and column names in SQL/migrations before writing queries.
- Use additive migrations only.
- Keep grants aligned with frontend table usage; `npm run qa:hardening` audits this.
- Do not put service-role credentials in frontend code or frontend hosting env.
