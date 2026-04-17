# Commit Logs

Last updated: 2026-04-17  
Current baseline on `main`: active working branch

Recent work continued beyond deployment stability and export hardening into a much more capable HR Documents module. The app already had the role-gated `HR Tools > HR Documents` tab, live preview, and PDF export for offer letters, employment contracts, payslips, warning letters, and termination letters. That foundation has now been extended into a template-driven document workspace with DB-backed template records, schema compatibility fallbacks, richer employee legal identity fields, and document branding support for logo, watermark, and footer text.

The HR Documents runtime now supports manual candidate entry for offer letters, signer selection with title override, contract-type-aware form switching for `PKWT`, `PKWTT`, and `PKHL`, and dynamic payroll earning/deduction rows. Warning letter generation now persists active SP metadata when the schema supports it, while termination exports record richer legal basis, company policy, outcome, and sanction details into `admin_activity_log`.

The latest implementation pass also moved templates from a small form concept into a practical A4 editing flow. The workspace now fetches HR templates lazily, allows template selection from `hr_document_templates`, and adds template management actions inside the UI: `New Draft`, `Duplicate`, `Save`, and `Delete`. Template metadata stays in the left setup panel, while long-form template body editing happens directly on the A4 document surface. The preview and PDF renderer both consume the same placeholder-driven template body so edited content is reflected immediately in preview/export.

Document signing UX was also upgraded. Preview and export layouts now show structured signature placeholders for both company-side and employee/candidate-side signing, covering two operational modes: digital signature placement and printed wet-sign documents. The renderer now produces clearer signature boxes instead of simple signer text lines, which makes contracts and offer letters much more realistic for HR operations.

Documentation and QA were updated alongside the feature work. The repo now includes refreshed HR document planning/testing docs plus expanded Playwright coverage for manual offer generation, contract-type switching, template-preview editing, SP persistence, termination logging, and access control.

Immediate follow-up remains straightforward: apply the HR document migration in production Supabase projects, verify template CRUD in an environment where `hr_document_templates` exists, run `tests/hr-documents.spec.js`, and continue with the next quality step if needed, such as rendering stored signature images directly inside the signature placeholder boxes.
