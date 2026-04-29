# Commit Log

## 2026-04-29 - Manpower Recruitment Deletion Adapter Fix

Status: done
Branch: main
Commit: `d37d1d9`
Changes:
- [x] Route recruitment-card deletion through backend adapters
- [x] Add Supabase `deletePipeline`
- [x] Add Laravel `DELETE /recruitment-pipeline/{id}`
- [x] Update manpower plan status doc
Files:
- `src/modules/data/manpower.js`
- `src/lib/backends/supabase-adapter.js`
- `src/lib/backends/laravel-adapter.js`
- `backend/routes/api.php`
- `backend/app/Http/Controllers/ManpowerController.php`
- `docs/manpower-planning-plan.md`
DB tables:
- `recruitment_pipeline`
Notes:
- No schema migration was needed because the table and grants already existed.

## 2026-04-29 - Documentation Process Alignment

Status: done
Branch: main
Commit: docs alignment checkpoint
Changes:
- [x] Add missing process docs referenced by `claude.md`
- [x] Document Laravel API route surface
- [x] Document active database schema map
- [x] Document env and git workflow rules
- [x] Sync HR payroll migration docs
Files:
- `claude.md`
- `agents.md`
- `commit-log.md`
- `docs/tech-stack.md`
- `docs/db-schema.md`
- `docs/api-endpoints.md`
- `docs/coding-standards.md`
- `docs/env-guide.md`
- `docs/git-workflow.md`
- `docs/project-status.md`
- `docs/commit-logs.md`
- `docs/fresh-supabase-setup.md`
- `docs/schema-discipline.md`
- `migrations/README.md`
- `scripts/support/canonical-migration-chain.mjs`
DB tables:
- `hr_payroll_records`
Notes:
- This pass aligns the repo with the documentation process expected by `claude.md`.
