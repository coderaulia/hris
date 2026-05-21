# Documentation Index

Last updated: 2026-05-21

This docs tree is organized around current operating references. Historical notes should stay in
`docs/commit-logs.md` or `AGENTS.md`; detailed audit backlog belongs in `docs/code-audit.md` and
`docs/missing-features.md`.

## Start Here

- [Project status](project-status.md): current implementation shape, verification baseline, and
  remaining delivery gaps.
- [Missing features](missing-features.md): confirmed product/QA gaps that still need work.
- [Code audit](code-audit.md): actionable audit findings, resolved fixes, and next fix order.
- [Architecture](architecture.md): runtime boundaries and main module ownership.
- [Tech stack](tech-stack.md): framework, backend, validation, and runtime choices.

## Setup And Deployment

- [Fresh Supabase setup](fresh-supabase-setup.md): clean Supabase install order and seed notes.
- [Laravel backend local runbook](laravel-backend-local-runbook.md): local optional Laravel API
  setup and checks.
- [Environment guide](env-guide.md): frontend, Supabase Function, QA, and Laravel variables.
- [Supabase Functions deploy](supabase-functions-deploy.md): Edge Function secrets and deployment.
- [Hostinger Git deployment](hostinger-github-autodeploy.md): static frontend deployment.
- [Cloud / VPS deployment](cloud-vps-deployment.md): Laravel API plus Vite frontend on a VPS.

## Engineering References

- [API endpoints](api-endpoints.md): Laravel route surface and adapter response conventions.
- [Database schema](db-schema.md): active tables, views, and schema safety rules.
- [Schema discipline](schema-discipline.md): migration and rollback expectations.
- [Coding standards](coding-standards.md): adapter, SQL, docs, and verification rules.
- [Git workflow](git-workflow.md): branch, commit, and doc timing guidance.
- [Module system](module-system.md): environment-controlled feature composition.
- [HR Documents enhancement status](hr-documents-enhancement-plan.md): current HR Documents
  implementation and remaining signature/document QA work.

## Lean Handoff Docs

- [Commit logs](commit-logs.md): session-level log, not a commit-by-commit journal.
- [AGENTS.md](../AGENTS.md): top-level handoff notes for coding agents.
