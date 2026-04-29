# Agent Instructions

## Read Before Coding

docs/tech-stack.md → docs/project-status.md → docs/db-schema.md → docs/api-endpoints.md → docs/coding-standards.md

---

## Rules

- Branch per git-workflow.md before any code
- Verify DB column names against actual schema before writing queries
- Validate all inputs at route entry
- Response: `{ success, data }` or `{ success, error }`
- No `any`, no unsafe assertions
- Log errors with `[context]` prefix, never expose raw errors to client
- Check env-guide.md before using any env var
- Commit each working unit separately

---

## Documentation Timing

Do not update `docs/commit-logs.md`, `agents.md`, or `docs/project-status.md` after every commit.

Update those files only:

- at the end of a work session
- when the user explicitly asks for documentation/status updates
- when a process or schema change would make the current docs misleading

Keep these docs lean. They are handoff/status docs, not exhaustive transcripts.

---

## On First Prompt — Internal Planning Before Coding

Do not auto-write these sections unless the user asks. Keep the shape below as a planning checklist.

**docs/commit-logs.md**
[YYYY-MM-DD] — [name]

Status: 🔄 in progress
Branch: [type]/[slug]
Changes: [ ] task1, [ ] task2
Files: [list]
DB tables: [list or none]
Notes: [risks / migration needed?]

**agents.md**
[YYYY-MM-DD] [name]

Summary: [1 sentence]
Scope: [module]
Approach: [ordered steps]
Risks: [schema? env? migration?]
Output: [files]

**project-status.md** → append only for meaningful active work:

🔄 [name] — started [YYYY-MM-DD]

---

## On Task Complete — Update Docs

At the end of the session, or when the user asks:

1. docs/commit-logs.md → add a short session summary
2. agents.md → add a concise handoff note
3. project-status.md → update only current state, blockers, or completed milestones
4. api-endpoints.md → add new routes
5. db-schema.md → add new tables/columns

---

## DB Safety

1. Inspect schema before any query
2. Migrations: additive only, rollback script required
3. Test: local → staging → production only

---

## Deploy Checklist

- [ ] Local tested
- [ ] Staging tested
- [ ] Production deployed + verified
- [ ] No errors in logs
- [ ] Docs updated
