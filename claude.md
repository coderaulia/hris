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

## On First Prompt — Auto-Output Before Coding

**commit-log.md**
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

**project-status.md** → append:

🔄 [name] — started [YYYY-MM-DD]

---

## On Task Complete — Update Docs

1. commit-log.md → mark `[x]`, status `✅ done`
2. agents.md → append outcome + files changed
3. project-status.md → move to Completed
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
