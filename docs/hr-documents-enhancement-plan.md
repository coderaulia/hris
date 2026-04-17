# HR Documents Enhancement Status

Updated: 2026-04-17

## Goal

Keep a current implementation record for the HR Documents workspace, especially around:

- editable HR templates
- Indonesian contract variants (`PKWT`, `PKWTT`, `PKHL`)
- manual candidate offer letters
- dynamic payroll breakdown
- SP persistence
- termination/legal metadata
- signature-ready preview and export layouts

## Current Implementation

The current HR Documents module now supports:

- document setup for `offer_letter`, `employment_contract`, `payslip`, `warning_letter`, and `termination_letter`
- subject source switching between employee data and manual entry where appropriate
- signer selection with title override
- DB-backed template fetching with safe fallback when the HR template tables are not available yet
- editable template metadata:
  - template name
  - document title
- A4 template body editing on the document surface instead of a narrow textarea
- template management actions:
  - select
  - create draft
  - duplicate
  - save
  - delete
- preview/export rendering from template placeholders
- payroll earnings/deductions breakdown rows
- active SP persistence on warning letter generation
- richer termination metadata logging
- signature placeholders for:
  - company-side digital sign placement
  - employee/candidate digital sign placement
  - wet-sign areas on printed documents

Primary implementation files:

- [src/modules/documents.js](/c:/Users/Administrator/Documents/hris-vanaila/src/modules/documents.js:1)
- [src/lib/pdfTemplates.js](/c:/Users/Administrator/Documents/hris-vanaila/src/lib/pdfTemplates.js:1)
- [src/modules/data/hr-documents.js](/c:/Users/Administrator/Documents/hris-vanaila/src/modules/data/hr-documents.js:1)
- [src/components/tab-documents.html](/c:/Users/Administrator/Documents/hris-vanaila/src/components/tab-documents.html:1)
- [src/styles/main.css](/c:/Users/Administrator/Documents/hris-vanaila/src/styles/main.css:1)
- [tests/hr-documents.spec.js](/c:/Users/Administrator/Documents/hris-vanaila/tests/hr-documents.spec.js:1)

## Delivered Workstreams

### 1. Data Foundation

Delivered:

- employee legal identity/document columns
- document branding settings
- `hr_document_templates`
- `hr_document_reference_options`
- compatibility fallback when new schema is not present yet

Key migration:

- [migrations/20260417_hr_documents_foundation.sql](/c:/Users/Administrator/Documents/hris-vanaila/migrations/20260417_hr_documents_foundation.sql:1)

### 2. Setup UX Refactor

Delivered:

- dynamic document type setup
- manual candidate mode for offer letters
- signer selector and signer title override
- contract-type-aware form fields
- payroll row editor

### 3. Template System

Delivered:

- template selection from DB-backed records
- template placeholder interpolation for preview and PDF
- A4 editing surface for long-form template body editing
- template CRUD flow in the UI:
  - new draft
  - duplicate
  - save
  - delete

Current editor model:

- template metadata stays in the left panel
- body editing happens on the A4 surface in the right panel
- edited drafts update preview/export immediately

### 4. Preview/PDF Upgrade

Delivered:

- company logo support
- dual-signature layout for offer letters and contracts
- payroll confidentiality/watermark support
- Bahasa salary-in-words helper
- signature placeholder boxes for both digital-sign and printed wet-sign usage

### 5. Persistence and Audit

Delivered:

- warning letter updates employee SP fields when supported by schema
- termination export logs legal/company/outcome/sanction metadata
- template save/delete actions are logged

## Placeholder Support

Current template body placeholders include:

- `{{company_name}}`
- `{{employee_name}}`
- `{{legal_name}}`
- `{{employee_position}}`
- `{{department}}`
- `{{job_level}}`
- `{{contract_type}}`
- `{{contract_duration}}`
- `{{probation_duration}}`
- `{{nomor_surat}}`
- `{{letter_date}}`
- `{{start_date}}`
- `{{contract_start_date}}`
- `{{work_location}}`
- `{{basic_salary}}`
- `{{salary_in_words}}`
- `{{warning_level}}`
- `{{last_working_day}}`
- `{{termination_reason}}`
- `{{signer_name}}`
- `{{signer_title}}`

## Known Operational Notes

### Schema Compatibility

The UI is intentionally resilient when the HR document schema is not fully applied yet:

- employee fetch/save falls back to the legacy employee schema
- missing `hr_document_templates` and `hr_document_reference_options` tables do not block the module

However, reusable template save/delete requires the migration-backed table to exist.

### Signature Behavior

Current signature rendering intentionally supports two document realities:

- digital signing workflows with stored signature images
- printed documents that still need wet signatures

So the preview/PDF now shows a combined signature placeholder area instead of only text labels.

## Recommended Next Improvements

The main remaining improvements are quality-of-life and legal-content depth, not core functionality:

1. Render the actual signature image inside the signature placeholder when `signature_image_url` exists.
2. Add a dedicated template list/history view with version comparisons.
3. Add controlled reference pickers for legal basis and sanctions using `hr_document_reference_options`.
4. Add richer page-break controls for long Indonesian contract templates.
5. Add template-level default signature rules by document type and contract type.

## Release Checklist

Before production rollout:

1. Apply [migrations/20260417_hr_documents_foundation.sql](/c:/Users/Administrator/Documents/hris-vanaila/migrations/20260417_hr_documents_foundation.sql:1).
2. Verify `npm.cmd run build` passes.
3. Run [tests/hr-documents.spec.js](/c:/Users/Administrator/Documents/hris-vanaila/tests/hr-documents.spec.js:1).
4. Confirm HR/legal review of the default Indonesian template pack.
5. Validate A4 export layout for:
   - long contracts
   - payroll
   - dual-signature documents

