# HR Documents Module Continuation Plan

This plan continues development based on `hr-document-plan.md`, adapted to the current codebase architecture (`src/main.js` lazy feature loaders, role-aware sidebar groups, and browser-first Supabase access pattern).

## Execution Status (Updated 2026-04-16)

- [x] Phase 1: Workspace shell + navigation
- [x] Phase 2: Dynamic form + live preview module
- [x] Phase 3: PDF generation engine
- [x] Phase 4: Guardrails, activity logging, and smoke QA

## Goal

Ship a production-ready **HR Documents** workspace where `hr` and `superadmin` can generate:
- Offer Letter
- Employment Contract
- Payslip
- Warning Letter (SP1/SP2/SP3)
- Termination Letter

Each document should support:
- employee auto-fill from `state.db`
- dynamic variable fields per template
- live on-screen preview
- polished client-side PDF export

## Current Baseline

- Dedicated module is implemented in `src/modules/documents.js`.
- PDF engine is implemented in `src/lib/pdfTemplates.js` using `jspdf` + `jspdf-autotable`.
- Navigation is wired in `src/main.js` with role-aware access and lazy loading.
- Branding is sourced from `state.appSettings` and applied to preview/PDF letterhead.
- Smoke QA exists in `tests/hr-documents.spec.js`.

## Delivery Scope (This Iteration)

1. Build end-to-end local generation flow (UI + preview + PDF export).
2. Restrict access to `hr` and `superadmin`.
3. Use app branding from `app_settings` for letterhead and signatures.
4. Add activity log events (`document.generate`) for traceability.

Out of scope for this iteration:
- persistent document archive table
- e-signature workflow
- server-side PDF rendering

## Phase Plan

### Phase 1: Workspace Shell + Navigation

#### [NEW] `src/components/tab-documents.html`
- Add a new `content-section` (`id="tab-documents"`).
- Build two-column layout:
  - Left: employee picker, document type picker, dynamic form area, download button.
  - Right: A4 preview container.

#### [MODIFY] `index.html`
- Inject `<div id="component-documents"></div>` with other page components.

#### [MODIFY] `src/main.js`
- Import and inject `tab-documents.html`.
- Add lazy loader: `documents: () => import("./modules/documents.js")`.
- Register document actions in `window.__app`.
- Add sidebar group item:
  - label: `HR Documents`
  - roles: `["superadmin", "hr"]`
  - tabId: `tab-documents`
- Update `switchTab()` to render document workspace when active.

Acceptance:
- HR and superadmin can open Documents tab.
- Other roles cannot access documents navigation or content.

### Phase 2: Dynamic Form + Live Preview Module

#### [NEW] `src/modules/documents.js`
- Build view-model state:
  - selected employee
  - selected document type
  - type-specific fields
- Read source data from:
  - `state.db` (employee identity, role/position, department)
  - `state.appSettings` (company/department/app labels)
- Implement template configuration map per type:
  - required fields
  - field labels/types
  - preview renderer callback
- Render live preview on each input change (with safe HTML escaping).
- Validate required fields before enabling download.

Acceptance:
- Template fields switch correctly by document type.
- Preview updates instantly and safely as fields change.
- Validation blocks PDF generation for incomplete required fields.

### Phase 3: PDF Generation Engine

#### [NEW] `src/lib/pdfTemplates.js`
- Build reusable helpers:
  - `drawLetterhead(doc, branding)`
  - `drawSignatureBlock(doc, signer)`
  - `drawBodyText(doc, paragraphs, options)`
  - `drawPayslipTable(doc, rows)` (`jspdf-autotable`)
- Export one entry point:
  - `generateHrDocumentPdf({ type, employee, values, branding, signer })`
- Standardize output metadata:
  - filename pattern: `{docType}_{employeeId}_{YYYYMMDD}.pdf`
  - margins, typography, footer page numbering for multi-page docs

#### [MODIFY] `src/modules/documents.js`
- Wire `Download PDF` to `generateHrDocumentPdf(...)`.
- Trigger browser file save and success/error notifications.

Acceptance:
- All five document types generate valid PDFs.
- Payslip renders tabular salary rows correctly.
- Multi-page body text wraps cleanly without clipping.

### Phase 4: Guardrails, Logging, and QA

#### [MODIFY] `src/modules/documents.js`
- Enforce role checks at runtime before actions.
- Add `logActivity(...)` with payload:
  - actor
  - employee id
  - document type
  - timestamp

#### [NEW] `tests/hr-documents.spec.js`
- Add smoke E2E path:
  - open tab as HR
  - select employee + document
  - fill required fields
  - verify preview contains employee name + document title
  - verify export button flow completes without runtime errors

Acceptance:
- Unauthorized roles are blocked.
- Activity entries are captured.
- Smoke test passes in CI/local Playwright run.

## File Change Summary

New files:
- `src/components/tab-documents.html`
- `src/modules/documents.js`
- `src/lib/pdfTemplates.js`
- `tests/hr-documents.spec.js`

Modified files:
- `index.html`
- `src/main.js`

## Risks and Mitigations

1. Legal wording drift across document templates
- Mitigation: keep template strings centralized in `pdfTemplates.js` and review once with HR/legal before release.

2. Complex text overflow in long warning/termination details
- Mitigation: use wrapped text helper + auto page break checks on every paragraph block.

3. Branding data missing in `app_settings`
- Mitigation: fallback labels (`HR Performance Suite`, `Company`) and graceful rendering without logo.

## Verification Checklist

1. Login as `hr` and `superadmin`, confirm tab visibility and access.
2. Login as `manager` and `employee`, confirm tab is hidden/inaccessible.
3. Generate each document type for at least one employee.
4. Validate filename format and PDF readability.
5. Confirm activity log entries are recorded for each generation event.
6. Run `npm run qa:e2e tests/hr-documents.spec.js` (or full suite if preferred).
