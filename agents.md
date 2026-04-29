# Agents

## 2026-04-29 Codex

Summary: Fixed recruitment pipeline deletion so manpower cards delete through the backend adapter boundary.
Scope: Manpower planning
Approach: Confirmed the stale direct-Supabase delete path, added matching Supabase and Laravel adapter methods, added a Laravel delete route/controller action, updated the manpower plan, then verified syntax/build/hardening.
Risks: Laravel endpoint currently uses the existing controller/resource pattern; deeper request validation can be added when the backend controllers are hardened as a separate pass.
Output:
- `src/modules/data/manpower.js`
- `src/lib/backends/supabase-adapter.js`
- `src/lib/backends/laravel-adapter.js`
- `backend/routes/api.php`
- `backend/app/Http/Controllers/ManpowerController.php`
- `docs/manpower-planning-plan.md`
- Commit `d37d1d9`

## 2026-04-29 Codex

Summary: Aligned project documentation with the process expected by `claude.md`.
Scope: Documentation and process
Approach: Created the missing docs referenced by `claude.md`, documented API/schema/env/git workflow, and synced status docs with the current manpower and HR payroll state.
Risks: `claude.md` describes stricter branch/process behavior than the current local `main` workflow; `docs/git-workflow.md` documents that mismatch explicitly.
Output:
- `claude.md`
- `commit-log.md`
- `agents.md`
- `docs/tech-stack.md`
- `docs/db-schema.md`
- `docs/api-endpoints.md`
- `docs/coding-standards.md`
- `docs/env-guide.md`
- `docs/git-workflow.md`
- related status/setup docs
- Commit: docs alignment checkpoint
