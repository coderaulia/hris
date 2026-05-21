# Commit Logs

Last updated: 2026-05-21
Current baseline on `main`: active working branch

This file is a lean session log. Update it at the end of a work session or when the user asks, not after every commit.

## 2026-05-21

Reconciled the documentation surface against the current project state. Added `docs/README.md` as
the docs map, refreshed README/status/audit references, corrected stale absolute links, and removed
redundant historical docs:

- `docs/context.md`
- `docs/development-phase1-runbook.md`
- `docs/refactor/module-map.md`
- `docs/refactor/smoke-checklist.md`

Current setup, architecture, schema, deployment, audit, missing-features, and handoff docs remain in
place as focused references. Verification for this doc-only cleanup used markdown link/search
checks plus `git diff --check`; no application code changed.

## 2026-05-09

Continued `docs/missing-features.md` and `docs/code-audit.md` by completing the next audit fix:
rollback companions for every active Supabase migration. The migration folder now has paired
`*.rollback.sql` files for the full canonical chain, including assessment/training, probation,
role scoping, KPI governance, security hardening, grants, legacy assessment columns, manpower,
dashboard views, HR document templates, payroll records, and the existing HR document archive.

Audit and status docs now mark rollback companion coverage as resolved and clarify that rollback
scripts are reverse-chain recovery tools that should be dry-run newest-first before production
use.

Verification: `npm run qa:hardening` passed with 12 forward migrations and 12 rollback migrations
scanned.

## 2026-05-08

Continued the missing-features/code-audit fix order. Rollback SQL now has a supported
`*.rollback.sql` QA convention, `20260507_hr_document_archive.sql` is in the canonical migration
chain, Laravel scoped reads were tightened for assessment/training, performance-score save no
longer depends on a missing `Auth` import, and employee role validation now accepts `hr` and
`director`.

Laravel HR document archive parity was added for PDF upload/download/delete with private local
storage, plus adapter support for multipart upload and authenticated blob downloads. Backend
feature tests were added for the scoped-resource and archive flows, and Playwright adapter coverage
now exercises Laravel archive upload/download. Bundle chunking was split so `pdf-vendor` dropped
below the 500 KB warning threshold.

Verification: `npm run build`, `npm run qa:hardening`, and
`npx playwright test tests/backend-adapter.spec.js` passed. Laravel PHP tests were not run because
`php` and `composer` were not available on PATH in this shell.

## 2026-04-29

Manpower planning Phase 3 is documented as complete for the current implementation. Recruitment-card deletion now goes through the backend adapter with Supabase/Laravel support and Laravel `DELETE /api/v1/recruitment-pipeline/{id}`.

The documentation process is aligned with `CLAUDE.md` around lean session updates. `docs/commit-logs.md`, `AGENTS.md`, and `docs/project-status.md` should be updated at session end or on request, not after every commit.

HR Documents documentation was refreshed for the new reusable payroll import path. The active migration chain now includes `20260429_hr_payroll_records.sql`, and the setup/testing docs call out payroll CSV import verification for payslip generation.

## 2026-04-17

Recent work continued beyond deployment stability and export hardening into a much more capable HR Documents module. The app already had the role-gated `HR Tools > HR Documents` tab, live preview, and PDF export for offer letters, employment contracts, payslips, warning letters, and termination letters. That foundation has now been extended into a template-driven document workspace with DB-backed template records, schema compatibility fallbacks, richer employee legal identity fields, and document branding support for logo, watermark, and footer text.

The HR Documents runtime now supports manual candidate entry for offer letters, signer selection with title override, contract-type-aware form switching for `PKWT`, `PKWTT`, and `PKHL`, and dynamic payroll earning/deduction rows. Warning letter generation now persists active SP metadata when the schema supports it, while termination exports record richer legal basis, company policy, outcome, and sanction details into `admin_activity_log`.

The latest implementation pass also moved templates from a small form concept into a practical A4 editing flow. The workspace now fetches HR templates lazily, allows template selection from `hr_document_templates`, and adds template management actions inside the UI: `New Draft`, `Duplicate`, `Save`, and `Delete`. Template metadata stays in the left setup panel, while long-form template body editing happens directly on the A4 document surface. The preview and PDF renderer both consume the same placeholder-driven template body so edited content is reflected immediately in preview/export.

Document signing UX was also upgraded. Preview and export layouts now show structured signature placeholders for both company-side and employee/candidate-side signing, covering two operational modes: digital signature placement and printed wet-sign documents. The renderer now produces clearer signature boxes instead of simple signer text lines, which makes contracts and offer letters much more realistic for HR operations.

Documentation and QA were updated alongside the feature work. The repo now includes refreshed HR document planning/testing docs plus expanded Playwright coverage for manual offer generation, contract-type switching, template-preview editing, SP persistence, termination logging, and access control.

This entry is historical. Later sessions added payroll import, generated-document archive storage,
Laravel archive parity, and rollback companions. Current HR Documents follow-up is now tracked in
`docs/project-status.md`, `docs/missing-features.md`, and `docs/hr-documents-enhancement-plan.md`.
