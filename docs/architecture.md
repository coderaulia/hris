# Architecture

Last updated: 2026-04-17

## High-Level Diagram

```text
Browser (Vite SPA)
|
|-- Supabase Auth              <- sign-in, session restore, sign-out, password flows
|-- Supabase Postgres          <- live CRUD data, protected by grants + RLS
|   |-- app_settings           <- branding, labels, runtime config
|   |-- employees              <- employee identity, legal identity, SP state, signer metadata
|   |-- competency_config      <- competency framework definitions
|   |-- assessment tables      <- manager/self assessments and history
|   |-- training tables        <- employee training records
|   |-- kpi governance         <- KPI definitions, target versions, approvals, KPI records
|   |-- probation / PIP        <- probation reviews, monthly scores, attendance, PIP plans
|   |-- hr_document_templates  <- editable HR template definitions
|   |-- hr_document_reference_options <- controlled HR/legal reference lists
|   `-- admin_activity_log     <- audit trail
|-- Supabase Edge Functions
|   |-- auth-callbacks         <- callback normalization and profile resolution
|   |-- admin-user-mutations   <- privileged user creation and role mutation
|   |-- approval-notifications <- notification dispatch with dry-run fallback and provider-backed delivery
|   `-- report-exports         <- binary PDF/XLSX generation + Storage signed URLs
|-- Client HR Document Engine
|   |-- `src/modules/documents.js`   <- setup UI, validation, A4 editor, template management
|   `-- `src/lib/pdfTemplates.js`    <- client-side PDF renderer for HR documents
`-- /healthz.json              <- static health check (no server needed)
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
9. Deploy Edge Functions.
10. Deploy the static build to Hostinger.
11. Verify login, profile resolution, dashboard/probation exports, and HR document preview/PDF/template CRUD behavior.

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
| HR Documents | `employees`, `app_settings`, `hr_document_templates`, `hr_document_reference_options`, `admin_activity_log`, `src/lib/pdfTemplates.js` | Client-side template-driven document generation, A4 editing, PDF export, audit logging |
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

- `document.generate` activity entries for exported documents
- `document_template.save` and `document_template.delete` activity entries for template management
- employee SP state updates on warning letter generation when supported by schema

## Backend Boundary

This app intentionally keeps normal CRUD browser-side through Supabase + RLS.

Edge Functions are used only where the browser is the wrong boundary:

- auth callback normalization
- privileged auth / role mutation
- notification dispatch
- heavy export generation and Storage delivery

HR documents intentionally remain client-side exports in this iteration. The browser owns:

- document setup
- live preview
- A4 template editing
- PDF generation

The app is not moving toward a general backend CRUD proxy.

## Known Constraints

- Reusable template save/delete depends on the `hr_document_templates` table existing in Supabase.
- When the migration is missing, the UI falls back gracefully for preview/export but cannot persist reusable templates.
- Long legal templates still require careful manual QA for page-break behavior.
- Signature placeholders support digital-sign placement and wet-sign printing, but do not yet render the actual stored signature image inside the box.
