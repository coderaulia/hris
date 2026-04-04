# Project Status

Last updated: 2026-04-03
Baseline commit: `0aeaab2`

## Snapshot

- Product: HR Performance Suite
- Current architecture: Vite static SPA + Supabase Auth/Postgres/RLS
- Deployment mode: push to `main` builds and deploys the static app to Hostinger
- Main quality gates in repo: `npm run build`, `npm run qa:hardening`, optional `npm run qa:e2e`, optional `npm run qa:negative`
- Current codebase state: stable feature baseline, sanitized public repo, partial internal refactor still in progress

## Delivery Status

| Area | Current State | Gap / Risk | Recommended Next Step |
| --- | --- | --- | --- |
| Authentication and access control | Login, logout, password reset, first-login password change, session timeout, and role-scoped access are in place. | Production password-reset and invite redirect behavior depends on environment config that is not yet wired through the deploy workflow. | Add an explicit production redirect config path and document ownership of that value. |
| Employee and organization management | Employee CRUD, role setup, org settings, and config import/export flows are available. | Seed/default business data has been intentionally removed from the repo, so onboarding now depends on private imports or manual setup. | Define a private onboarding/import SOP and keep it outside the public repo. |
| Competency assessment and training | Self-assessment, manager review, history tracking, and training log flows are present. | Regression coverage is still stronger in manual checks than in automated tests. | Add targeted E2E coverage for assessment and training workflows. |
| KPI management | KPI definitions, records, history, target setting, weight profiles, and manager-facing controls are implemented. | KPI behavior on older environments depends on required migrations being applied. | Confirm migrations on live/staging and expand regression coverage around KPI edits and approvals. |
| KPI governance | Effective-month versioning, pending approvals, approval/rejection flow, and snapshot-based non-retroactive scoring are implemented. | Security and scope rules should still be validated in runtime on real role accounts, not only with static audit scripts. | Run `qa:negative` in a safe environment and keep `rls_postcheck.sql` in release steps. |
| Probation and PIP | Probation reviews, qualitative notes, attendance deductions, settings-driven rules, PDF/Excel export, and PIP plan flows are available. | If the probation migrations are missing, some monthly persistence falls back to local state instead of database-backed storage. | Verify migration status in every existing deployment before calling this area complete. |
| Dashboard and reporting | KPI summaries, department drill-downs, employee exports, activity logs, and dashboard analytics are in place. | Build output is still large, and heavy exports remain browser-side. | Plan performance cleanup and consider future server-side export support if the current approach becomes slow. |
| Deployment and operations | Auto-deploy to Hostinger, health check endpoint, and optional deploy notifications are available. | Public-repo database backup workflow was removed for safety; backup ownership now needs a private home. | Stand up private backup/export automation and record where it lives. |
| Internal code structure | Data, records, and dashboard layers have stable facades and extraction boundaries. | `records/core.js` and `dashboard/core.js` are still the main source of truth, so maintenance cost is higher than it should be. | Continue incremental extraction during feature work instead of attempting a big-bang rewrite. |
| Documentation | README, refactor notes, QA notes, and this tracking set now exist. | Docs can drift quickly if they are not updated alongside releases. | Update these three files after each milestone or deployment-relevant change. |

## Required Operational Dependencies

These are not optional if we want production to match the current feature set:

1. Existing databases must have the incremental migrations applied:
   - `migrations/20260307_safe_next_steps.sql`
   - `migrations/20260308_probation_monthly_attendance.sql`
   - `migrations/20260308_probation_hr_access_policy.sql`
   - `migrations/20260308_manager_kpi_competency_policy.sql`
   - `migrations/20260308_director_role_scope.sql`
   - `migrations/20260308_kpi_governance.sql`
   - `migrations/20260309_security_qa_hardening.sql`
2. Production deploy secrets must remain current for Supabase, FTP deploy, health checks, and optional notifications.
3. Backup/export jobs now need to live in a private system, not in this public repo.

## Current Gap Register

### High priority

- Production auth redirect configuration is not explicitly wired into the deploy workflow.
- Backup ownership moved out of the repo, but the replacement location/process is not documented here yet.
- Live/staging environments need a verified checklist for applied migrations and runtime role checks.

### Medium priority

- Refactor phase 1 is incomplete; large core files still carry too much feature logic.
- Assessment and training flows need broader automated regression coverage.
- Browser bundles and client-side exports should be reviewed for performance as the app grows.

### Lower priority

- Create a more explicit release checklist for each deployment batch.
- Add a simple docs index or release note link from the main README later if this docs set becomes a daily workflow tool.

## Recommended Next Work Order

1. Close the production config gaps: auth redirect, backup ownership, migration verification.
2. Strengthen automated coverage around assessment, KPI approval, and probation flows.
3. Keep chipping away at the `records/core.js` and `dashboard/core.js` extraction during normal feature work.
4. Revisit performance and backend/API decisions only after the operational gaps are stable.

## Update Rule

Update this file when one of these happens:

- a feature area changes status
- a new migration becomes required
- a production risk or dependency is discovered
- a gap is closed or reprioritized
