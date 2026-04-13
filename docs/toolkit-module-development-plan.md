# Toolkit Module Development Plan

## Goal
Deliver an HR toolkit workspace that lets `hr` and `superadmin` users generate standardized HR documents, define salary structures, and complete interview evaluations inside the existing HRIS without leaving the app or editing Word/Excel files manually.

## Repo Fit
- The app already uses env-driven module composition, so Toolkit should ship as a new optional module: `toolkit`
- Normal CRUD should stay browser-side through Supabase + RLS, following the current architecture
- PDF generation should reuse the existing Edge Function export boundary instead of moving document rendering into the browser
- Toolkit records should link back to existing `employees` data whenever an employee record already exists

## Recommended Module Shape
### New optional module
- Add `toolkit` to `src/config/app-modules.js`
- Gate navigation and data sync behind `VITE_ENABLED_MODULES`
- Keep Toolkit as one module for MVP, with internal tabs for:
  - `Documents`
  - `Salary Structure`
  - `Interview Evaluation`

### Navigation recommendation
- Add a dedicated `HR Toolkit` workspace for `superadmin` and `hr`
- Keep it separate from `Employees` and `Records` because the workflow is generation-oriented, not employee master-data or history-first
- Let generated outputs optionally deep-link back to employee records later

## Phase 0: Foundation
### Objective
Create the module shell, shared data model, and export pipeline before building individual generators.

### Scope
- Add Toolkit module registration, nav entry, and lazy-loaded workspace
- Create shared Toolkit data layer in `src/modules/data/toolkit.js`
- Define Supabase schema and migrations for:
  - `hr_toolkit_templates`
  - `hr_toolkit_documents`
  - `hr_toolkit_document_versions`
  - `salary_structures`
  - `salary_structure_bands`
  - `interview_evaluations`
  - `interview_evaluation_scores`
- Add secure Storage path for generated PDFs
- Extend `report-exports` or add a Toolkit export branch for:
  - HTML-to-PDF rendering
  - signed URL delivery
  - consistent filename generation
- Add RLS policies for `hr` and `superadmin`

### Deliverables
- Empty Toolkit workspace is reachable from navigation
- Schema exists with audit-friendly timestamps and creator fields
- Export pipeline can generate a simple test PDF from template payload data

## Phase 1: Shared Document Engine
### Objective
Build one reusable document-generation system that all document types can use.

### Scope
- Create structured form schema per document type
- Create variable injection and template rendering helpers
- Support:
  - HTML preview
  - PDF export
  - draft/save/load
  - document numbering
  - version history
  - optional employee linkage
- Add clause toggles for conditional sections
- Add company branding injection from `app_settings`

### Recommended design
- Store document types as config, not hard-coded one-off pages
- Separate:
  - input schema
  - template content
  - rendering helpers
  - export action
- Keep generated output immutable once finalized; edits should create a new version

### Deliverables
- Shared renderer works for multiple template types
- Users can create, preview, save draft, finalize, and download a document
- Template data is reusable across all document generators

## Phase 2: Documents MVP
### Objective
Ship the must-have HR document generators in the PRD using the shared engine.

### Scope
#### 1. Offer Letter Generator
- Candidate-oriented input form
- Compensation block with base salary and allowance
- Employment type support:
  - `PKWT`
  - `PKWTT`
  - `Intern`
- Auto numbering and branded output

#### 2. Contract Generator
- Support MVP contract types:
  - `PKWT`
  - `PKWTT`
- Contract period, salary terms, working hours, and clause toggles
- Versioned output with baseline legal-ready structure

#### 3. Payslip Generator
- Single-employee monthly payslip only for MVP
- Salary breakdown:
  - base salary
  - allowances
  - overtime
  - deductions
- Keep calculations basic and explicit in UI

#### 4. Warning Letter Generator
- SP1, SP2, SP3 presets
- Formal tone templates
- Incident metadata and issuer details

#### 5. Termination Letter Generator
- Types:
  - resignation acceptance
  - contract end
  - PHK
- Mandatory legal disclaimer in preview and final export

### Deliverables
- All five document flows are usable end-to-end
- HR can generate a compliant-looking PDF in under 5 minutes
- Finalized documents are stored and searchable inside Toolkit

## Phase 3: Salary Structure Builder
### Objective
Provide a lightweight internal compensation reference tool, not a payroll engine.

### Scope
- Editable grid for job levels and salary ranges
- Department mapping support
- Allowance structure fields
- Versioning:
  - draft
  - published
  - archived
- Export to CSV and PDF
- Internal read-only sharing view for reference during hiring

### Data model notes
- One salary structure header can have many band rows
- Band rows should store:
  - level
  - department
  - minimum salary
  - maximum salary
  - allowance notes or values
- Preserve historical versions instead of overwriting current ranges

### Deliverables
- HR can create and publish a salary band table
- Previous versions remain readable
- Hiring teams can view the latest approved structure

## Phase 4: Interview Evaluation Tool
### Objective
Standardize candidate scoring and recommendation output.

### Scope
- Evaluation form with weighted categories
- Default categories:
  - technical skill
  - communication
  - culture fit
  - experience relevance
- Scoring scale config:
  - `1-5` for MVP
- Comment field per category
- Auto-calculated weighted summary
- Final recommendation:
  - `Hire`
  - `Consider`
  - `Reject`
- Exportable evaluation summary

### Recommended design
- Keep score categories configurable so later roles can use different evaluation rubrics
- Store evaluator identity, timestamp, and linked candidate or request reference
- Prepare for future linkage to recruitment/manpower, but do not block MVP on that integration

### Deliverables
- Interviewers can submit consistent scorecards
- HR can compare evaluations without manual spreadsheet consolidation
- Reports can be exported or attached to hiring records later

## Phase 5: Hardening and Rollout
### Objective
Make the module reliable enough for live HR operations.

### Scope
- Add validation for required fields and risky document states
- Add empty-state and error-state UX for export failures
- Add audit logging for finalize/download actions where appropriate
- Add basic search and filter by:
  - document type
  - employee or candidate name
  - created date
  - status
- Add test coverage for:
  - template rendering
  - document numbering
  - permission checks
  - export payload generation
- Run HR content review on templates before production rollout

### Deliverables
- Stable MVP ready for staged release
- Core flows covered by smoke tests and manual QA checklist
- Templates reviewed by HR/legal owner before activation

## Suggested Delivery Order
### Sprint 1
- Toolkit module registration
- schema and RLS
- shared data layer
- export proof of concept

### Sprint 2
- shared document engine
- offer letter generator
- contract generator

### Sprint 3
- payslip generator
- warning letter generator
- termination letter generator

### Sprint 4
- salary structure builder

### Sprint 5
- interview evaluation tool
- filtering, history, QA, rollout polish

## Suggested Database Relationships
- `employees` -> `hr_toolkit_documents` = 1:N optional
- `hr_toolkit_templates` -> `hr_toolkit_documents` = 1:N
- `hr_toolkit_documents` -> `hr_toolkit_document_versions` = 1:N
- `salary_structures` -> `salary_structure_bands` = 1:N
- `interview_evaluations` -> `interview_evaluation_scores` = 1:N

## Permissions
- `superadmin`: full access to templates, generation, exports, and history
- `hr`: full operational access for Toolkit MVP
- `manager`: no write access in MVP; future read or evaluation-only scope can be added later
- `director`: no Toolkit access in MVP unless reporting use cases become necessary

## Success Criteria
- HR can produce standard HR documents in under 5 minutes per task
- Document generation and PDF export complete within the existing platform performance envelope
- Salary structure setup takes under 30 minutes
- Interview evaluations are captured in structured scores instead of free-form notes
- Toolkit ships without breaking the existing browser CRUD + edge export architecture

## Out of Scope for MVP
- e-signature
- payroll automation
- legal compliance engine
- multi-language templates
- bulk payslip generation
- deep recruitment integration beyond optional future linkage

## Recommended First Build Slice
If we want the fastest path to visible value, build this slice first:
- Toolkit module shell
- shared document engine
- offer letter generator
- contract generator
- PDF export and saved history

That slice proves the core architecture once, then the remaining document types become config and template expansion instead of brand-new platform work.
