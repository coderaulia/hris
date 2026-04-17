# HR Documents Enhancement Implementation Plan

Updated: 2026-04-17

## Objective

Extend the current HR Documents workspace so it supports Indonesian HR/legal workflows more accurately, especially for:

- company logo and company-side digital signature image
- editable document templates
- offer letters for candidates outside the employee database
- contract-type-aware employment documents (`PKWT`, `PKWTT`, `PKHL`)
- richer payroll breakdowns
- SP tracking on employee records
- more complete termination reasoning aligned to UU Ketenagakerjaan and company policy

This plan is grounded in the current implementation:

- UI: [src/components/tab-documents.html](/c:/Users/Administrator/Documents/hris-vanaila/src/components/tab-documents.html:1)
- document workspace logic: [src/modules/documents.js](/c:/Users/Administrator/Documents/hris-vanaila/src/modules/documents.js:1)
- PDF engine: [src/lib/pdfTemplates.js](/c:/Users/Administrator/Documents/hris-vanaila/src/lib/pdfTemplates.js:1)
- smoke test: [tests/hr-documents.spec.js](/c:/Users/Administrator/Documents/hris-vanaila/tests/hr-documents.spec.js:1)

## Current Baseline

The current module already supports:

- live preview + PDF export for `offer_letter`, `employment_contract`, `payslip`, `warning_letter`, and `termination_letter`
- branding text from `app_settings`
- single company-side signer using the current logged-in user
- hardcoded template fields and hardcoded English preview/PDF copy

Key gaps relative to the requested features:

- employee selection is mandatory for every document type
- templates are not editable and are stored in code
- signer cannot be changed per document
- there is no candidate signature block
- employment contract logic is not localized for Indonesian law and is not contract-type aware
- payroll only supports summarized allowance/deduction totals
- SP status is not persisted on employee records
- termination reasons are not normalized against legal/company references

## Recommended Delivery Strategy

Implement this in 5 workstreams so we do not mix legal copy redesign, schema changes, and PDF rendering in one risky release.

### Workstream 1: Data Foundation and Settings

Add the minimum schema/settings needed to support editable templates, richer employee identity data, selectable signers, and SP status.

Recommended database changes:

- `employees`
  - add `legal_name`
  - add `place_of_birth`
  - add `date_of_birth`
  - add `address`
  - add `nik_number`
  - add `job_level`
  - add `signature_image_url`
  - add `active_sp_level`
  - add `active_sp_until`
  - add `active_sp_reason`
- `app_settings`
  - add `document_logo_url`
  - add `document_default_watermark`
  - add `document_footer_text`
- new `hr_document_templates`
  - `id`
  - `document_type`
  - `locale`
  - `contract_type` nullable
  - `template_name`
  - `template_status`
  - `version_no`
  - `header_json`
  - `body_json` or `body_markup`
  - `signature_config_json`
  - `is_default`
  - audit timestamps
- new `hr_document_reference_options`
  - stores controlled dropdown values for termination reasons, sanctions, legal references, SP outcomes, benefit defaults

Why this shape:

- signer image belongs closer to the employee/person who signs, not only to app branding
- editable templates should live outside code so HR can revise wording without redeploying
- controlled reference tables reduce legal wording drift and keep documents consistent

Affected areas:

- migrations: new SQL migration under `migrations/`
- employee runtime fetch/mapping: likely [src/modules/data/employees.js](/c:/Users/Administrator/Documents/hris-vanaila/src/modules/data/employees.js:1)
- settings UI: [src/modules/settings.js](/c:/Users/Administrator/Documents/hris-vanaila/src/modules/settings.js:266)

### Workstream 2: Document Setup UX Refactor

Refactor the document setup panel so each document type can choose between employee-backed data and manual inputs.

UI changes in [src/components/tab-documents.html](/c:/Users/Administrator/Documents/hris-vanaila/src/components/tab-documents.html:1):

- replace the single static setup form with sections:
  - document type
  - subject source: `Employee Database` or `Manual Entry`
  - template selector
  - signer selector
  - dynamic fields
- add a signer preview block showing signer name, title, and whether a digital signature image exists
- add optional second signature block for employee/candidate acknowledgment

Logic changes in [src/modules/documents.js](/c:/Users/Administrator/Documents/hris-vanaila/src/modules/documents.js:1):

- replace `documentsDraft.employeeId` with a more flexible subject model:
  - `subjectMode`
  - `employeeId`
  - `manualIdentity`
- add template loading from database instead of only `DOCUMENT_TEMPLATES`
- add signer selection:
  - choose from employees
  - allow manual override for name/title when needed
- add per-document field schemas driven by template + contract type
- keep live preview and validation, but validate hidden/conditional fields correctly

Priority behavior by document type:

- `offer_letter`
  - default to `Manual Entry`
  - no employee database requirement
  - include candidate name and candidate signature block
- `employment_contract`
  - default to `Employee Database`
  - support manual override for incomplete employee records
- `payslip`
  - employee database remains required
- `warning_letter`
  - employee database remains required
- `termination_letter`
  - employee database remains required

### Workstream 3: Template System and Legal Copy Localization

Move legal/document wording out of hardcoded English strings and into editable Bahasa Indonesia templates.

Recommended template model:

- store template metadata in DB
- store field schema separately from body content
- support placeholder variables like:
  - `{{employee_name}}`
  - `{{place_of_birth}}`
  - `{{date_of_birth}}`
  - `{{nik_number}}`
  - `{{job_title}}`
  - `{{job_level}}`
  - `{{salary_in_words}}`
  - `{{contract_type}}`
  - `{{contract_duration}}`
  - `{{probation_duration}}`
  - `{{signer_name}}`
  - `{{signer_title}}`
  - `{{company_name}}`
- support conditional sections:
  - `PKWT`: duration clause
  - `PKWTT`: probation clause
  - `PKHL`: daily/casual worker wording and alternate signer/title rules

Implementation changes:

- [src/modules/documents.js](/c:/Users/Administrator/Documents/hris-vanaila/src/modules/documents.js:1)
  - fetch template list
  - render editable preview from template placeholders
  - allow HR to edit selected template content in-app
- [src/lib/pdfTemplates.js](/c:/Users/Administrator/Documents/hris-vanaila/src/lib/pdfTemplates.js:1)
  - stop hardcoding major document paragraphs
  - render from normalized template payload
  - preserve special renderers for payroll tables and signature blocks

Required document template coverage:

- Offer Letter
  - editable
  - includes `nomor_surat`, benefits, contract type, candidate sign block, signer override
- Employment Contract
  - editable
  - Bahasa Indonesia
  - separate defaults for `PKWT`, `PKWTT`, `PKHL`
  - wording aligned to UU Ketenagakerjaan and company policy baseline
- Termination
  - editable
  - legal/company reference section

Important note:

- final Indonesian legal wording should be reviewed by HR/legal before production use
- engineering should build the template system and placeholders, not hardcode legal interpretation in multiple files

### Workstream 4: PDF/Preview Engine Upgrade

Upgrade the shared renderer in [src/lib/pdfTemplates.js](/c:/Users/Administrator/Documents/hris-vanaila/src/lib/pdfTemplates.js:1) so documents can include logo, image signatures, watermarking, and multi-sign blocks.

Renderer additions:

- `drawLogo(doc, branding)`
- `drawWatermark(doc, text, options)`
- `drawSignatureBlock(doc, signer, options)` enhancement:
  - optional signature image
  - signer title
  - signer date
  - placement for company-side and employee-side signatures
- `drawTemplateBody(doc, templateBlocks, context)`
- `numberToBahasaCurrency(value)` helper for salary text such as `sepuluh juta rupiah`

Preview additions in [src/modules/documents.js](/c:/Users/Administrator/Documents/hris-vanaila/src/modules/documents.js:375):

- show company logo in the preview header
- show digital signature image when available
- show confidential watermark text for payroll
- show two-column signature layout where required

Per-document rendering requirements:

- Offer Letter
  - logo
  - candidate manual identity
  - company sign + candidate sign columns
- Employment Contract
  - contract-type-specific title/body
  - employee biodata block
  - salary number + salary in words
  - dynamic probation or contract duration clause
- Payroll
  - earnings breakdown section
  - deduction breakdown section
  - summary totals
  - `Confidential` text and watermark
- SP
  - offense impact/outcome section
- Termination
  - legal basis section
  - sanction/punishment text
  - outcome from reason

### Workstream 5: Persistence, Flags, and Auditability

Persist the parts of the workflow that affect employee status or future legal review.

Recommended persistence:

- on warning letter generation
  - update employee `active_sp_level`, `active_sp_until`, `active_sp_reason`
  - add activity log details with warning level and validity
- on warning expiry
  - do not auto-clear in UI only; either:
    - calculate active status from date dynamically, or
    - run scheduled cleanup later
- on termination letter generation
  - log normalized reason category, legal basis, sanction text, and signer
- on template edit
  - log `document_template.update`

Optional but strongly recommended:

- new `employee_document_history` table for generated document metadata and source payload snapshot

This is valuable because:

- templates will become editable
- signer and legal basis may change over time
- HR may need an audit trail of which wording/version produced a given PDF

## Feature-by-Feature Breakdown

### 1. Shared Improvements

Scope:

- company logo on preview and PDF
- company-side digital signature image
- signer can be selected, not always current user

Implementation notes:

- store company logo URL in `app_settings`
- store signature image URL per employee
- expose signer selector in documents UI with default equal to current user
- support fallback to typed signer name/title if no employee profile exists

### 2. Offer Letter

Requested changes:

- use text input only for candidate instead of employee DB
- editable template
- flexible signer + candidate signature column
- benefits, `nomor surat`, and contract type fields
- contract type should affect probation/contract wording

Implementation notes:

- add manual subject schema:
  - candidate name
  - position/title
  - department
  - address optional
- add fields:
  - `nomor_surat`
  - `contract_type`
  - `benefits[]`
  - `probation_duration`
  - `contract_duration`
- validation rules:
  - require `probation_duration` for `PKWTT`
  - require `contract_duration` for `PKWT`
  - require daily/casual wording fields for `PKHL` if needed by HR

### 3. Employment Contract

Requested changes:

- editable template in Bahasa Indonesia
- template varies by `PKWT`, `PKWTT`, `PKHL`
- include job description, full identity, title, level, salary in words, address, NIK, signer
- wording changes between contract duration and probation duration

Implementation notes:

- pull identity primarily from employee record, with manual override for missing fields
- add contract data fields:
  - `contract_type`
  - `nomor_surat`
  - `job_description`
  - `work_location`
  - `salary_amount`
  - `salary_in_words`
  - `contract_duration`
  - `probation_duration`
- template packs:
  - `employment_contract_id_pkwt`
  - `employment_contract_id_pkwtt`
  - `employment_contract_id_pkhl`

### 4. Payroll

Requested changes:

- dynamic allowance and deduction rows with names
- show breakdown before summary
- confidential text + watermark

Implementation notes:

- replace single numeric `allowances` and `deductions` with repeatable arrays:
  - earnings rows: `[{ name, amount }]`
  - deduction rows: `[{ name, amount }]`
- seed common rows:
  - `Tunjangan`
  - `PPh21`
  - `BPJS Kesehatan`
  - `BPJS TK`
- calculate totals from row arrays, not from aggregate input
- keep basic salary separate

### 5. SP / Warning Letter

Requested changes:

- employee flagged when active SP exists
- add company impact/outcome from offense

Implementation notes:

- extend warning form with:
  - `offense_impact`
  - `corrective_actions`
  - `validity_period`
- persist active SP metadata to employee record
- surface active SP badge in employee and/or dashboard views after generation

### 6. Termination

Requested changes:

- editable document
- reason must reflect UU and company regulation
- add outcome and sanction/punishment text

Implementation notes:

- form should separate:
  - main reason category
  - legal basis reference
  - company regulation reference
  - outcome/impact
  - sanction or punishment text
  - severance/final settlement notes
- use controlled reference options plus free-text explanation to avoid inconsistent wording

## File-Level Implementation Map

Primary files to modify:

- [src/components/tab-documents.html](/c:/Users/Administrator/Documents/hris-vanaila/src/components/tab-documents.html:1)
- [src/modules/documents.js](/c:/Users/Administrator/Documents/hris-vanaila/src/modules/documents.js:1)
- [src/lib/pdfTemplates.js](/c:/Users/Administrator/Documents/hris-vanaila/src/lib/pdfTemplates.js:1)
- [src/modules/settings.js](/c:/Users/Administrator/Documents/hris-vanaila/src/modules/settings.js:266)
- [src/modules/data/employees.js](/c:/Users/Administrator/Documents/hris-vanaila/src/modules/data/employees.js:1)
- [src/lib/branding.js](/c:/Users/Administrator/Documents/hris-vanaila/src/lib/branding.js:1)
- [tests/hr-documents.spec.js](/c:/Users/Administrator/Documents/hris-vanaila/tests/hr-documents.spec.js:1)

New files likely needed:

- `migrations/20260417_hr_documents_enhancements.sql`
- `src/modules/data/hr-document-templates.js` or equivalent helper
- `src/lib/documentTemplateRenderer.js`

## Suggested Delivery Phases

### Phase 1: Foundation

- add schema for employee legal identity, signature URL, SP fields
- add branding settings for document logo/watermark
- add `hr_document_templates`
- load template/settings data in runtime

Acceptance:

- template records can be stored and fetched
- signer image URL and company logo URL can be loaded in the app

### Phase 2: UI Refactor

- add manual subject mode
- add signer selector
- add repeatable row editor for payroll components
- add contract-type-aware dynamic fields

Acceptance:

- offer letter can be prepared without selecting an employee
- signer can be changed per document
- payroll rows can be added/removed dynamically

### Phase 3: Template and Renderer Migration

- switch preview/PDF generation to database-backed templates
- implement logo, dual signature blocks, watermark, salary-in-words helper
- add Bahasa Indonesia defaults for offer, contract, termination

Acceptance:

- documents render from editable template data
- contract wording changes correctly for `PKWT`, `PKWTT`, `PKHL`

### Phase 4: SP and Termination Persistence

- persist active SP flag data to employee records
- add normalized legal/company reason fields for termination
- expand activity logging

Acceptance:

- generated SP updates employee active SP status
- termination logs include reason basis and signer metadata

### Phase 5: QA and Legal Review

- add E2E coverage for offer letter manual mode
- add E2E coverage for contract type switching
- add E2E coverage for payroll breakdown + watermark text
- add E2E coverage for SP flag persistence
- run HR/legal wording review on Indonesian templates

Acceptance:

- smoke tests pass
- HR approves default template pack before release

## Testing Plan

Expand [tests/hr-documents.spec.js](/c:/Users/Administrator/Documents/hris-vanaila/tests/hr-documents.spec.js:1) with these scenarios:

- HR can generate offer letter using manual candidate entry
- signer can be changed from current user to another employee
- employment contract changes correctly between `PKWT`, `PKWTT`, `PKHL`
- payroll supports multiple named earnings and deductions
- payroll preview shows `Confidential` text
- warning letter generation updates employee active SP fields
- termination document captures legal basis and sanction text
- non-HR role still cannot access the module

Manual QA checklist:

- preview and PDF layout remain aligned
- uploaded logo and signature image scale correctly on A4
- long legal paragraphs wrap across pages safely
- salary in words is correct in Bahasa Indonesia
- missing signer image falls back gracefully to typed name/title only

## Risks and Mitigations

1. Legal wording changes frequently.
- Mitigation: editable templates + versioning + controlled references.

2. Employee master data is incomplete for legal documents.
- Mitigation: manual override fields with clear validation and missing-data prompts.

3. Signature and logo assets may be missing or too large.
- Mitigation: validate image type/size on upload and provide text-only fallback.

4. Template flexibility can make rendering brittle.
- Mitigation: use a normalized block renderer instead of arbitrary raw HTML in PDF generation.

5. SP flag can become stale.
- Mitigation: derive active state from `active_sp_until` where possible instead of relying only on manual cleanup.

## Recommended Order of Build

1. Foundation schema + settings
2. signer/logo support
3. offer letter manual mode
4. contract-type-aware employment contract templates
5. payroll breakdown refactor
6. SP persistence
7. termination legal basis fields
8. full regression + HR/legal review

## Outcome

After this plan is implemented, the HR Documents workspace will move from a static PDF generator to a configurable HR document platform that is much closer to real Indonesian HR operations and safer for ongoing legal/content maintenance.
