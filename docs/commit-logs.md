# Commit Logs

Last updated: 2026-04-03
Current baseline on `main`: `0aeaab2`

## Purpose

Use this file as the lightweight project changelog and milestone journal.
It should answer three questions quickly:

1. What landed?
2. Why did it matter?
3. What still needs follow-up?

## Recent Milestone Log

| Date | Commit / Range | Theme | What Landed | Follow-up / Notes |
| --- | --- | --- | --- | --- |
| 2026-03-11 | `0aeaab2` | Repo sanitization | Removed seeded employee/KPI data from the public repo, sanitized `complete-setup.sql`, replaced company-specific defaults, and removed the public backup workflow. | Confirm private backup/export automation exists outside this repo. Confirm production auth redirect config is explicitly set. |
| 2026-03-10 | `792c34e` | KPI UI fix | Corrected KPI record counts and records badges. | Keep an eye on dashboard/records consistency during future KPI work. |
| 2026-03-09 | `dba6da5` | Security and QA hardening | Added manager KPI fixes plus sprint 6 hardening scripts and RLS auditing support. | Run `npm run qa:hardening` regularly. On live environments, also run runtime negative-path checks and post-deploy RLS verification. |
| 2026-03-08 | `a795121` | Dashboard and manual polish | Added dashboard analytics improvements and bilingual manual toggle support. | Keep manual content aligned with current modules and business rules. |
| 2026-03-08 | `a38a554` | KPI governance | Added effective-month KPI versioning, monthly target versioning, approval flow support, and snapshot-based scoring so historical records remain stable. | Existing databases must have the sprint 4 migrations applied before this is fully reliable in production. |
| 2026-03-08 | `1a1ea8a` | Refactor foundation | Split data, records, and dashboard modules behind stable facades and feature entry points. | Refactor is still phase 1. `records/core.js` and `dashboard/core.js` remain the main implementation source of truth. |
| 2026-03-08 | `2127d11` to `d5b8843` | Probation and PIP rollout | Built probation review foundations, monthly review flow, attendance scoring, export hardening, qualitative review handling, and settings-driven rule engine support. | Older environments need the probation migrations applied or some monthly persistence falls back to local state. |
| 2026-03-01 | `ced03a2` | Auth and dashboard base | Added dynamic data login screen, total employee dashboard support, and test data seed at that stage of the project. | Public seed data was later removed by `0aeaab2`; keep onboarding/imports private. |
| 2026-02-28 | `307135e` | Audit and reporting | Added admin activity logging, broader data safety work, reporting improvements, and UX upgrades. | Good base for future audit summaries and admin reporting. |
| 2026-02-28 | `8811915` | Password policy and security cleanup | Added `must_change_password` support, first-login enforcement, and security-oriented cleanup. | Password reset / invite redirect should always be validated per environment. |
| 2026-02-28 | `e4040a8` to `23f97c9` | Deployment pipeline setup | Introduced CI/CD deployment flow and later deployment fixes. | Keep deploy secrets, site health checks, and notification hooks current. |

## Current Themes To Watch

- Production configuration is now intentionally generic. That is safer for the repo, but it means live-specific settings must be managed outside source control.
- The app is feature-rich, but the codebase is still mid-refactor internally.
- Several important flows depend on incremental migrations being applied on existing databases.

## How To Update This File

- Add a new row whenever a feature, fix, migration, deployment change, or security hardening task lands.
- Group related commits into one row when they represent a single milestone.
- Always write the follow-up note, even if the answer is "none right now".
- Keep this file focused on meaningful milestones, not every tiny edit.

## Entry Template

```md
| YYYY-MM-DD | `hash` | Theme | What landed | Follow-up / Notes |
```
