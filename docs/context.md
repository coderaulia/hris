# Project Context

Last updated: 2026-05-09

## What This Is

**HR Performance Suite** - a browser-first SPA for managing the full employee performance lifecycle inside a single organisation. The app can run against Supabase or the Laravel API through the backend adapter; Supabase remains the primary deployed model for Auth, Postgres/RLS, Storage, and Edge Functions.

## Stack

| Layer | Technology |
|---|---|
| Build | Vite (static SPA) |
| Auth | Supabase Auth or Laravel Sanctum |
| Database | Supabase Postgres + RLS, optionally accessed through Laravel API |
| Client SDK | `@supabase/supabase-js`, plus backend adapter modules |
| Exports | Mixed: Edge `report-exports` for KPI/probation files, client-side `jspdf` templates for HR document generation |
| Hosting | Hostinger (static files) |
| Health check | `/healthz.json` (static file) |

## Roles

- `anon` - unauthenticated access (branding fetch, login page)
- `authenticated` - base role post-login
- `employee` - self-service access to personal scoped records
- `manager` - team-scoped operational access
- `hr` - HR staff with elevated access to assessments, KPIs, probation workflows, and HR document generation
- `director` - director-scoped dashboard/reporting access
- `superadmin` - full access including user creation

> **Critical operational note**: RLS policies alone are not enough on a fresh Supabase environment. Data API grants for both `anon` and `authenticated` must be explicitly created alongside policies. Missing grants break profile resolution and role-aware login even when policies appear correct.

## Core Feature Modules

1. **Employee Management** - employee records, manpower planning, headcount requests, recruitment board, role assignment
2. **Competency Assessments** - configurable competency frameworks, scoring
3. **Training Logs** - training records per employee
4. **KPI Governance** - KPI definition, targets, approval workflows
5. **Probation / PIP Workflows** - probation tracking, performance improvement plans
6. **HR Documents** - dynamic templates, A4 template editing, preview, and PDF export for offer/contract/payslip/warning/termination letters
7. **Dashboard & Reporting** - aggregated views, edge-backed KPI/probation exports
8. **Settings / Branding** - org-level configuration fetched on load

## Auth Flows (all browser-side)

- Sign-in
- Session restore
- Sign-out
- Password reset
- Password update
- Superadmin user creation (through edge mutation boundary)

## Known Pain Points

- Fresh environment setup requires `complete-setup.sql` plus the canonical migration chain
- RLS + grant mismatch causes silent employee-role fallback (looks like auth works, but role is wrong)
- Notification provider secrets are still required for fully live outbound notifications
- Long legal templates still need careful manual QA for page breaks and Indonesian wording review before production use
- Rollback companions exist for every active migration, but should be dry-run newest-first before production recovery use

## Current HR Documents State

The HR Documents workspace is now a configurable HR document module, not only a static export form. It currently includes:

- role-gated access for `hr` and `superadmin`
- document setup for `offer_letter`, `employment_contract`, `payslip`, `warning_letter`, and `termination_letter`
- manual candidate entry for offer letters
- signer selection and signer title override
- DB-backed template fetching with compatibility fallback when the new HR tables are missing
- A4 template editing surface for long-form document body content
- template management actions:
  - select
  - new draft
  - duplicate
  - save
  - delete
- payroll earning/deduction breakdown rows
- payroll CSV import backed by `hr_payroll_records`
- warning-letter SP persistence
- termination audit metadata
- signature placeholders for both digital-sign placement and wet-sign printing
- generated PDF archive metadata and file storage in Supabase/Laravel modes

Primary implementation files:

- `src/modules/documents.js`
- `src/lib/pdfTemplates.js`
- `src/modules/data/hr-documents.js`
- `src/components/tab-documents.html`
- `src/styles/main.css`
- `tests/hr-documents.spec.js`

## What Does NOT Exist Yet

- External/public signer portal for generated HR documents
- Full e-signature workflow or approval-sign sequence for generated HR documents
- Full end-to-end coverage across every module/path (smoke coverage exists, including `tests/hr-documents.spec.js`)
