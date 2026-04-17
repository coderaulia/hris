# Project Context

Last updated: 2026-04-17

## What This Is

**HR Performance Suite** - a browser-first SPA for managing the full employee performance lifecycle inside a single organisation. The app uses direct Supabase browser access for normal CRUD and targeted Supabase Edge Functions where privileged or heavy server-side boundaries are required.

## Stack

| Layer | Technology |
|---|---|
| Build | Vite (static SPA) |
| Auth | Supabase Auth (browser-side) |
| Database | Supabase Postgres + RLS |
| Client SDK | `@supabase/supabase-js` |
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

- Fresh environment setup requires running bootstrap SQL + retrofit migration to set Data API grants
- Production auth redirect handling is still being stabilised
- RLS + grant mismatch causes silent employee-role fallback (looks like auth works, but role is wrong)
- Notification provider secrets are still required for fully live outbound notifications
- Full HR template management requires the `hr_document_templates` migration-backed table to exist in Supabase
- Long legal templates still need careful manual QA for page breaks and Indonesian wording review before production use

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
- warning-letter SP persistence
- termination audit metadata
- signature placeholders for both digital-sign placement and wet-sign printing

Primary implementation files:

- `src/modules/documents.js`
- `src/lib/pdfTemplates.js`
- `src/modules/data/hr-documents.js`
- `src/components/tab-documents.html`
- `src/styles/main.css`
- `tests/hr-documents.spec.js`

## What Does NOT Exist Yet

- Custom backend server (optional, not planned on main)
- Persistent archive table for generated HR document files
- Full e-signature workflow or approval-sign sequence for generated HR documents
- Full end-to-end coverage across every module/path (smoke coverage exists, including `tests/hr-documents.spec.js`)
