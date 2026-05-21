# Git Workflow

Updated: 2026-05-21

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

- Frontend code: `rtk npm run build`
- Schema/security: `rtk npm run qa:hardening`
- JS syntax: `rtk node --check <file>`
- PHP syntax: `rtk php -l <file>`
- Browser behavior: focused Playwright spec through `rtk npx playwright test <spec>`

## Documentation Timing

Do not update session/status docs after every commit. Update them at the end of the work session, when the user asks, or when leaving them stale would mislead the next agent.

Session/status docs:

- `docs/project-status.md`
- `docs/commit-logs.md`
- `AGENTS.md`

Reference docs should be updated in the same working unit when code changes affect them:

- `docs/api-endpoints.md` for route changes
- `docs/db-schema.md` for schema changes
- the relevant feature plan/status doc

## Current Known Dirty-Worktree Caveat

Always inspect `git status --short` before staging. If unrelated user-owned changes are present,
leave them out of the docs or code slice unless the user explicitly asks to include them.
