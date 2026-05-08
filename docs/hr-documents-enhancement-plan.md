# HR Documents Enhancement Status

Updated: 2026-05-08

## Goal

Keep a current implementation record for the HR Documents workspace, especially around:

- editable HR templates
- Indonesian contract variants (`PKWT`, `PKWTT`, `PKHL`)
- manual candidate offer letters
- dynamic payroll breakdown
- payslip payroll CSV import
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
- payroll CSV template download/import for reusable employee-month payslip records
- generated document archive metadata and private PDF storage
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
- [migrations/20260429_hr_payroll_records.sql](/c:/Users/Administrator/Documents/hris-vanaila/migrations/20260429_hr_payroll_records.sql:1)
- [migrations/20260508_hr_document_archives.sql](/c:/Users/Administrator/Documents/hris-vanaila/migrations/20260508_hr_document_archives.sql:1)
- [migrations/20260508_hr_document_archive_storage.sql](/c:/Users/Administrator/Documents/hris-vanaila/migrations/20260508_hr_document_archive_storage.sql:1)
- [tests/hr-documents.spec.js](/c:/Users/Administrator/Documents/hris-vanaila/tests/hr-documents.spec.js:1)

## Delivered Workstreams

### 1. Data Foundation

Delivered:

- employee legal identity/document columns
- document branding settings
- `hr_document_templates`
- `hr_document_reference_options`
- `hr_payroll_records`
- `hr_document_archives`
- private Supabase Storage bucket `hr-document-archives`
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
- payroll data section for CSV template download/import

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
- payslip CSV import upserts payroll rows by employee and payroll period
- imported payroll records hydrate payslip identity, cutoff, earnings, deductions, and company-side benefit rows
- generated PDF exports create `hr_document_archives` rows and upload the PDF file to private storage when available
- recent archives expose internal company/recipient signature status actions

Key migration:

- [migrations/20260429_hr_payroll_records.sql](/c:/Users/Administrator/Documents/hris-vanaila/migrations/20260429_hr_payroll_records.sql:1)
- [migrations/20260508_hr_document_archives.sql](/c:/Users/Administrator/Documents/hris-vanaila/migrations/20260508_hr_document_archives.sql:1)
- [migrations/20260508_hr_document_archive_storage.sql](/c:/Users/Administrator/Documents/hris-vanaila/migrations/20260508_hr_document_archive_storage.sql:1)

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
- missing `hr_payroll_records` does not block manual payslip generation
- missing `hr_document_archives` or the private archive bucket does not block PDF download

However, reusable template save/delete, reusable payroll import, and archive storage require their migration-backed tables/bucket to exist.

### Signature Behavior

Current signature behavior supports:

- digital signing workflows with stored signature images
- printed documents that still need wet signatures
- an internal company/recipient signature status sequence on archived documents

So the preview/PDF now shows a combined signature placeholder area instead of only text labels.

## Recommended Next Improvements

The main remaining improvements are quality-of-life and legal-content depth, not core functionality:

1. Render the actual signature image inside the signature placeholder when `signature_image_url` exists.
2. Add a dedicated template list/history view with version comparisons.
3. Add controlled reference pickers for legal basis and sanctions using `hr_document_reference_options`.
4. Add richer page-break controls for long Indonesian contract templates.
5. Add template-level default signature rules by document type and contract type.
6. Add external e-sign provider delivery from archived documents.
7. Add payroll import validation preview before saving large CSV batches.

## Release Checklist

Before production rollout:

1. Apply [migrations/20260417_hr_documents_foundation.sql](/c:/Users/Administrator/Documents/hris-vanaila/migrations/20260417_hr_documents_foundation.sql:1).
2. Apply [migrations/20260429_hr_payroll_records.sql](/c:/Users/Administrator/Documents/hris-vanaila/migrations/20260429_hr_payroll_records.sql:1).
3. Apply [migrations/20260508_hr_document_archives.sql](/c:/Users/Administrator/Documents/hris-vanaila/migrations/20260508_hr_document_archives.sql:1).
4. Apply [migrations/20260508_hr_document_archive_storage.sql](/c:/Users/Administrator/Documents/hris-vanaila/migrations/20260508_hr_document_archive_storage.sql:1).
5. Verify `npm.cmd run build` passes.
6. Run [tests/hr-documents.spec.js](/c:/Users/Administrator/Documents/hris-vanaila/tests/hr-documents.spec.js:1).
7. Confirm HR/legal review of the default Indonesian template pack.
8. Validate A4 export layout for:
   - long contracts
   - payroll
   - dual-signature documents
9. Import a payroll CSV for at least one real employee ID and verify the matching payslip PDF uses the saved row.
10. Confirm generated PDFs create archive rows with `storage_status = stored`.
