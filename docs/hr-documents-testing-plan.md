# HR Documents Testing Plan

Updated: 2026-04-17

## Goal

Validate the HR Documents workspace end to end across:

- manual candidate offer generation
- contract-type-specific employment contracts
- payroll breakdown and confidentiality treatment
- warning letter persistence and employee SP flagging
- termination logging and legal metadata
- role-based access control

This testing plan assumes the current implementation in:

- `src/modules/documents.js`
- `src/lib/pdfTemplates.js`
- `tests/hr-documents.spec.js`

## Preconditions

Before running the full plan:

1. The app builds successfully with `npm.cmd run build`.
2. The environment has valid Supabase credentials for the Playwright/API tests.
3. For full schema coverage, run:
   - `migrations/20260417_hr_documents_foundation.sql`
4. Seed or confirm these users exist:
   - `superadmin@demo.local`
   - `hr@demo.local`
   - at least one manager
   - at least one normal employee

## Automated Coverage

Primary spec:

- `tests/hr-documents.spec.js`

Covered scenarios:

1. Payslip generation works with named earnings and deduction rows.
2. Payslip preview shows confidentiality text before export.
3. Offer letter supports manual candidate mode and signer override.
4. Employment contract switches field requirements between `PKWT` and `PKWTT`.
5. Warning letter generation records SP metadata and surfaces the SP badge.
6. Termination generation records legal basis, company-policy basis, and sanction metadata.
7. Non-HR users cannot access the workspace.

Recommended execution:

1. `npm.cmd run build`
2. `npx playwright test tests/hr-documents.spec.js`

If running the whole regression pack:

1. `npx playwright test`

## Manual QA

### A. Offer Letter

Verify:

- manual candidate entry works without selecting an employee
- signer can be changed to another employee
- title override appears in preview
- candidate acknowledgment block appears
- exported PDF filename is correct

### B. Employment Contract

Verify:

- `PKWT` shows contract duration and hides probation
- `PKWTT` shows probation duration and hides contract duration
- `PKHL` uses the correct template label when template records exist
- employee identity fields render correctly
- salary-in-words placeholder is correct in exported PDF

### C. Payroll

Verify:

- multiple earnings rows render in preview and PDF
- multiple deduction rows render in preview and PDF
- totals are calculated correctly
- confidentiality text and watermark appear
- signer block remains aligned on A4 export

### D. Warning Letter

Verify:

- warning level appears correctly in preview and export
- offense impact section appears when filled
- SP badge appears in employee directory after generation
- `active_sp_until` reflects the validity period if schema supports it

### E. Termination

Verify:

- legal basis and company policy basis render in preview and export
- outcome and sanction sections render when filled
- audit log contains the enriched termination metadata

### F. Access Control

Verify:

- `hr` and `superadmin` can access the module
- `manager` and `employee` cannot use the module
- direct tab switching does not bypass access control

## Release Checklist

Release only when all of the following are true:

1. `npm.cmd run build` passes.
2. `tests/hr-documents.spec.js` passes.
3. Manual QA confirms preview/PDF layout is acceptable on desktop and mobile-sized viewports.
4. HR/legal review signs off on the default Indonesian template pack.
5. The Supabase project has the Phase 1 migration applied if production should use DB-backed templates and SP persistence.

## Known Compatibility Note

The code now has fallback behavior for environments that have not yet applied the new HR Documents migration:

- employee fetch/save falls back to the legacy employee schema
- missing HR template/reference tables do not block the UI

That fallback is useful for development continuity, but production should still apply the migration so:

- SP persistence is stored in the database
- editable templates are available from `hr_document_templates`
- reference options are available from `hr_document_reference_options`
