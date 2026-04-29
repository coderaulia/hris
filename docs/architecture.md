# Architecture

Last updated: 2026-04-29

## High-Level Diagram

```text
Browser (Vite SPA)
|
`-- Backend Adapter Router (`src/lib/backend.js`)
    |-- Supabase Adapter (`src/lib/backends/supabase-adapter.js`)
    |   |-- Supabase Auth
    |   |-- Supabase Postgres (Direct CRUD via RLS)
    |   `-- Supabase Edge Functions
    `-- Laravel Adapter (`src/lib/backends/laravel-adapter.js`)
        `-- Laravel API (`backend/` directory)
            |-- Laravel Auth (Sanctum)
            `-- PHP/Lumen API (Scoped via EmployeeScopeService)
```

## Backend Architecture (Adapter Pattern)

The application implements an **Adapter Pattern** to support multiple backend infrastructures. The `src/lib/backend.js` module acts as the primary interface, routing all data operations to either the `Supabase` or `Laravel` implementation based on the `VITE_BACKEND_TYPE` environment variable.

### 1. Supabase Adapter (Default)
- Uses the standard Supabase JS client.
- Leverages Row Level Security (RLS) and Postgres Grants for security.
- Communicates directly with Supabase Edge Functions for privileged operations.

### 2. Laravel Adapter (Optional)
- Communicates with a custom PHP/Lumen API located in the `backend/` directory.
- Replicates RLS-like logic through a centralized `EmployeeScopeService` in PHP.
- Uses Laravel Sanctum for API token-based authentication.
- All frontend data modules (`employees.js`, `kpi.js`, etc.) consume this adapter transparently.

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
  `-- can access: broad employee, KPI, assessment, probation/PIP, and HR document operations

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
8. Apply [migrations/20260417_hr_documents_foundation.sql](/c:/Users/Administrator/Documents/hris-vanaila/migrations/20260417_hr_documents_foundation.sql:1) if HR template persistence should be active.
9. Apply [migrations/20260429_hr_payroll_records.sql](/c:/Users/Administrator/Documents/hris-vanaila/migrations/20260429_hr_payroll_records.sql:1) if payslip CSV import should persist reusable payroll rows.
10. Deploy Edge Functions.
11. Deploy the static build to Hostinger.
12. Verify login, profile resolution, dashboard/probation exports, HR document preview/PDF/template CRUD behavior, and payslip CSV import.

## Module Boundaries

| Module | Tables / Systems Used | Notes |
|---|---|---|
| Auth | Supabase Auth, `employees` | Browser auth plus edge callback normalization |
| Settings | `app_settings`, `admin_activity_log`, `employees` | Branding, user management, org config |
| Employees | `employees` | Core identity, legal identity, signer metadata, active SP state |
| Assessments | `competency_config`, `employee_assessments`, `employee_assessment_scores`, `employee_assessment_history` | Config-driven scoring and history |
| Training | `employee_training_records` | Per-employee training log |
| KPI | `kpi_definitions`, `kpi_definition_versions`, `employee_kpi_target_versions`, `kpi_records` | Governance and monthly performance |
| Probation / PIP | `probation_reviews`, `probation_monthly_scores`, `probation_attendance_records`, `pip_plans`, `pip_actions` | Performance follow-up and compliance flow |
| HR Documents | `employees`, `app_settings`, `hr_document_templates`, `hr_document_reference_options`, `hr_payroll_records`, `admin_activity_log`, `src/lib/pdfTemplates.js` | Client-side template-driven document generation, payslip payroll import, A4 editing, PDF export, audit logging |
| Dashboard | Cross-module read models | Aggregated summaries and export entry points |
| Edge Functions | Mixed | Callback handling, privileged mutations, notifications, exports |

## HR Documents Architecture

The HR Documents module now follows a split responsibility model:

### Setup Layer

Handled in `src/modules/documents.js`:

- role gating
- document-type-aware setup
- subject source switching
- signer selection
- dynamic field rendering
- payroll row editing
- payroll CSV template download/import
- validation state

### Template Layer

Handled in `src/modules/documents.js` plus `src/modules/data/hr-documents.js`:

- lazy loading of `hr_document_templates`
- fallback operation when template tables are absent
- template selection
- draft template state
- template CRUD:
  - create draft
  - duplicate
  - save
  - delete
- A4 body editing on the document surface

### Render Layer

Shared between:

- `src/modules/documents.js` for browser preview
- `src/lib/pdfTemplates.js` for PDF export

Both consume placeholder-driven template content so the preview and exported document stay aligned.

### Persistence/Audit Layer

The module writes:

- imported payslip rows into `hr_payroll_records` for reusable employee/month payroll data
- `document.generate` activity entries for exported documents
- `document_template.save` and `document_template.delete` activity entries for template management
- employee SP state updates on warning letter generation when supported by schema

## Backend Boundary

This app supports two backend boundaries:

1.  **Supabase Boundary**: Keeps normal CRUD browser-side through Supabase + RLS. Edge Functions are used only where the browser is the wrong boundary (auth callbacks, privileged mutations, notifications, exports).
2.  **Laravel Boundary**: Uses the `backend/` PHP API as a secure proxy. The browser never talks to Postgres directly. Security is enforced via Laravel middleware and `EmployeeScopeService` which replicates the logic of Postgres RLS policies.

HR documents intentionally remain client-side exports in both modes. The browser owns document setup, live preview, A4 template editing, and PDF generation.

The app supports a dual-stack approach, allowing legacy Supabase deployments and custom Laravel deployments to share the same frontend codebase.

## Known Constraints

- Reusable template save/delete depends on the `hr_document_templates` table existing in Supabase.
- When the migration is missing, the UI falls back gracefully for preview/export but cannot persist reusable templates.
- Long legal templates still require careful manual QA for page-break behavior.
- Signature placeholders support digital-sign placement and wet-sign printing, but do not yet render the actual stored signature image inside the box.
