# Architecture

Last updated: 2026-04-09

## High-Level Diagram

```text
Browser (Vite SPA)
|
|-- Supabase Auth            <- sign-in, session restore, sign-out, password flows
|-- Supabase Postgres        <- live CRUD data, protected by grants + RLS
|   |-- app_settings         <- branding, labels, runtime config
|   |-- employees            <- employee identity and employment records
|   |-- competency_config    <- competency framework definitions
|   |-- assessment tables    <- manager/self assessments and history
|   |-- training tables      <- employee training records
|   |-- kpi governance       <- KPI definitions, target versions, approvals, KPI records
|   |-- probation / PIP      <- probation reviews, monthly scores, attendance, PIP plans
|   `-- admin_activity_log   <- audit trail
|-- Supabase Edge Functions
|   |-- auth-callbacks       <- callback normalization and profile resolution
|   |-- admin-user-mutations <- privileged user creation and role mutation
|   |-- approval-notifications <- placeholder/provider-ready notification dispatch
|   `-- report-exports       <- binary PDF/XLSX generation + Storage signed URLs
`-- /healthz.json            <- static health check (no server needed)
```

## Data Access Model

```text
Browser CRUD path:
  Browser -> Supabase Data API -> grants check -> RLS policy check -> Postgres table

Edge Function authenticated path:
  Browser -> Edge Function -> caller-scoped Supabase client -> grants + RLS -> Postgres table

Edge Function privileged path:
  Browser/Webhook -> Edge Function -> service-role client -> privileged operation
```

Required grants must exist on every environment:

```sql
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON <tables> TO authenticated;
```

Key rule:
- app-table reads should usually use the caller-scoped client
- service-role access should be reserved for auth admin, Storage upload/signing, or similar privileged work

Missing grants can still break the app even when RLS policies look correct.

## Role Hierarchy

```text
anon
  `-- can fetch: limited public branding/bootstrap data when allowed

authenticated
  `-- can access: own profile and scoped data according to RLS

manager
  `-- can access: team-scoped KPI, assessment, probation, and reporting data

hr
  `-- can access: broad employee, KPI, assessment, probation, and PIP operations

director
  `-- can access: director-scoped dashboard and operational reporting paths

superadmin
  `-- full access + user creation / role mutation
```

## Environment Setup Checklist

1. Create Supabase project.
2. Run `complete-setup.sql` or the equivalent bootstrap path for a fresh environment.
3. Apply all required migrations for existing environments.
4. Ensure Data API grants are present for `authenticated`.
5. Verify RLS policies are present and aligned with current role scope.
6. Add frontend env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_AUTH_REDIRECT_URL`.
7. Add Edge Function secrets: `URL`, `ANON_KEY`, `SERVICE_ROLE_KEY`, and the function-specific secrets.
8. Deploy Edge Functions.
9. Deploy the static build to Hostinger.
10. Verify login, profile resolution, role assignment, and export downloads.

## Module Boundaries

| Module | Tables / Systems Used | Notes |
|---|---|---|
| Auth | Supabase Auth, `employees` | Browser auth plus edge callback normalization |
| Settings | `app_settings`, `admin_activity_log`, `employees` | Branding, user management, org config |
| Employees | `employees` | Core identity and employment entity |
| Assessments | `competency_config`, `employee_assessments`, `employee_assessment_scores`, `employee_assessment_history` | Config-driven scoring and history |
| Training | `employee_training_records` | Per-employee training log |
| KPI | `kpi_definitions`, `kpi_definition_versions`, `employee_kpi_target_versions`, `kpi_records` | Governance and monthly performance |
| Probation / PIP | `probation_reviews`, `probation_monthly_scores`, `probation_attendance_records`, `pip_plans`, `pip_actions` | Performance follow-up and compliance flow |
| Dashboard | Cross-module read models | Aggregated summaries and export entry points |
| Edge Functions | Mixed | Callback handling, privileged mutations, notifications, exports |

## Backend Boundary

This app intentionally keeps normal CRUD browser-side through Supabase + RLS.

Edge Functions are used only where the browser is the wrong boundary:
- auth callback normalization
- privileged auth / role mutation
- notification dispatch
- heavy export generation and Storage delivery

The app is not moving toward a general backend CRUD proxy.
