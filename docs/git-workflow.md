# Git Workflow

Updated: 2026-04-29

## Branching

`claude.md` asks for a branch per task. In this local checkout, current work has been happening on `main`; use a feature branch when starting new larger work:

```bash
git switch -c fix/recruitment-pipeline-delete
```

For small follow-up fixes already on `main`, keep commits narrow and document the scope.

## Commit Rules

- Commit each working unit separately.
- Do not include unrelated dirty worktree files.
- Do not revert user-owned changes unless explicitly asked.
- Before committing, inspect:

```bash
git status --short
git diff -- <files you plan to commit>
```

## Verification Before Commit

Pick the checks that match the change:

- Frontend code: `npm run build`
- Schema/security: `npm run qa:hardening`
- JS syntax: `node --check <file>`
- PHP syntax: `php -l <file>`
- Browser behavior: focused Playwright spec

## Documentation Timing

Do not update session/status docs after every commit. Update them at the end of the work session, when the user asks, or when leaving them stale would mislead the next agent.

Session/status docs:

- `docs/project-status.md`
- `docs/commit-logs.md`
- `agents.md`

Reference docs should be updated in the same working unit when code changes affect them:

- `docs/api-endpoints.md` for route changes
- `docs/db-schema.md` for schema changes
- the relevant feature plan/status doc

## Current Known Dirty-Worktree Caveat

At the time this guide was created, `_legacy/*` deletions were already present and unrelated to the manpower/doc-maintenance work. Keep them out of commits unless the user explicitly asks to remove legacy files.
