# MVP Implementation Plan

_Based on: hr-suite-growth-audit.md × current project state (2026-05-23)_
_Goal: sellable governance product, not generic HRIS_

---

## Positioning (non-negotiable reframe)

Stop selling "HRIS." Sell:

> **Performance & governance layer that sits beside the payroll tool the company already runs.**

Pitch: _"Keep your Talenta/Gadjian. We do the KPI governance, competency tracking, and probation/PIP they do badly — with approval trails, snapshot-locked records, and Indonesian HR docs."_

This removes the rip-and-replace objection on first sales call.

---

## Phase 0 — Stop (immediate, before touching any code)

These are scope traps. Stop spending time here.

| Item | Why |
|---|---|
| Laravel backend improvements | Zero customer value, high engineering cost. Supabase is the MVP backend. Laravel path stays in codebase but is not demo-ed, maintained, or sold. |
| Manpower planning module | Incomplete, not the wedge. Hidden via `VITE_ENABLED_MODULES`. |
| Payslip generation in HR Docs | Overlaps incumbent payroll tools. Drop from demo and sales pitch. |
| E-signature workflow | Nice-to-have, not a sale blocker at this stage. |
| Multi-tenancy | Not needed until 2–3 paying customers. |
| Playwright / Laravel feature tests | Useful later, not the blocker now. |

---

## Phase 1 — Email Delivery via Resend ✉️

**Why first:** Approval workflows feel fake without email. KPI approvals, probation decisions, PIP updates all dispatch notifications — but currently skip delivery because secrets are missing. This is demo-critical.

**Current state:** `supabase/functions/approval-notifications/index.ts` is implemented and wired. It reads `EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM` from Supabase secrets. Missing → logs `"unconfigured"` and skips.

**Steps:**

1. Create Resend account → get API key
2. Set secrets in Supabase Dashboard → Project Settings → Edge Functions:
   ```
   EMAIL_PROVIDER=resend
   EMAIL_API_KEY=re_xxxxxxxxxxxx
   EMAIL_FROM=noreply@yourdomain.com
   EMAIL_REPLY_TO=hr@yourcompany.com
   ```
3. Deploy edge function: `supabase functions deploy approval-notifications`
4. Run smoke test: `npm run qa:notifications` with real row IDs
5. Run live test: `npm run qa:notifications -- --live` — verify delivery for KPI definition, KPI target, probation, PIP flows
6. Update `docs/env-guide.md` with the Resend secret names

**Done when:** Email lands in inbox on a KPI target submission in the live app.

---

## Phase 2 — Visible Audit Trail Screen 🔍

**Why:** `admin_activity_log` is written. Nobody can see it. For a governance product, the viewable audit log IS the selling point. An HR director will ask: "Who changed this KPI target, when, approved by whom?"

**Current state:**
- `supabase-adapter.js:190` — reads `admin_activity_log`, limited to 100 rows, ordered by `created_at`
- `src/modules/data/activity.js` — `logActivity()` writes, `fetchActivityLogs()` reads into `state.activityLogs`
- `module-navigation.js:240` — `admin_activity_log` listed under Settings endpoints
- No UI renders this data to the user

**Steps:**

1. Add "Audit Log" tab inside Settings module (HR/superadmin only)
2. Render `state.activityLogs` as a filterable table:
   - Columns: `Timestamp | User | Action | Module | Record ID | Details`
   - Filter by: module (KPI / Probation / PIP / Documents), date range, user
   - Show `changed_by` name (join against `state.db` for display name)
3. Add "Export Audit Log" button → Excel via exceljs (see Phase 3 pattern)
4. Ensure `logActivity()` is called on all meaningful mutations: KPI definition save, target submit/approve/reject, probation status change, PIP action, document generation

**Done when:** HR director can open Settings → Audit Log, see who approved a KPI target, and export to Excel.

---

## Phase 3 — User-Facing Data Export 📊

**Why:** Mid-market buyers won't commit data without an exit. "Export all to Excel" per module is a trust signal AND a sale unlocker. `exceljs` is already installed — it just isn't user-facing.

**Current state:** `exceljs@^4.4.0` in package.json. No user-facing export buttons confirmed outside of payroll CSV download template.

**Modules to cover (in priority order):**

| Module | Export content |
|---|---|
| KPI Governance | KPI definitions + target versions + approval history per employee |
| Assessments | Competency scores per employee per period |
| Probation / PIP | Status, reviewer, dates, outcomes |
| Employee Directory | Full employee list with roles, departments, positions |
| Audit Log | (Covered in Phase 2) |

**Steps per module:**

1. Add `exportToExcel(data, filename)` util in `src/lib/exportUtils.js` (shared, one implementation)
2. Add "Export to Excel" button in each module's list/table view — HR/superadmin only
3. Map the module's current rendered data to flat rows (no transformations needed — use what's already on screen)
4. Wire button → `exportToExcel()` → browser download

**Implementation note:** Do NOT create new API calls for export. Export what's already loaded in `state`. If a user needs full history, they scroll/filter first.

**Done when:** HR director can export KPI results for one employee to Excel in under 3 clicks.

---

## Phase 4 — CSV Import for Onboarding 📥

**Why:** Mid-market buyer has 50–250 employees in a spreadsheet. If they can't import, onboarding blocks the deal. The setup fee covers this work — but it must work.

**Current state:** Payroll CSV import is implemented (`importPayrollRecords`). Employee directory has no import. KPI definitions have no import.

**Steps:**

1. **Employee CSV import** (Priority 4a)
   - Define CSV template: `name, email, position, department, role, hire_date, manager_email`
   - Add "Import Employees" button (superadmin only) → file picker → parse CSV → validate → batch upsert via `backend.employees` adapter
   - Download CSV template button next to import
   - Show import summary: N created, N updated, N errors with row numbers

2. **KPI Definition import** (Priority 4b)
   - Define CSV template: `kpi_name, department, position, weight, target_value, unit, period`
   - Add "Import KPI Definitions" button in KPI governance (HR/superadmin only)
   - Reuse import pattern from 4a

**Done when:** Can onboard a 50-person company from spreadsheet to working KPI tracking in one session.

---

## Phase 5 — Backup & Recovery Story 📋

**Why:** Buyer's IT will ask "what if you disappear or data is lost?" Not having an answer kills the deal silently.

**This is documentation, not code.** Per-customer Supabase instances (one project per customer) naturally isolate data. The story already exists — it just isn't written down.

**Deliverables:**

1. Add `docs/data-backup-recovery.md`:
   - Supabase automatic daily backups (PITR on Pro plan)
   - How to export a full database dump on demand
   - Customer data ownership: customer can request full export at any time
   - SLA / contact if something goes wrong

2. One-pager "Data Security & Backup" for non-technical buyers (can live in a sales deck, not in codebase)

**Done when:** Can answer "what happens to our data?" in a sales call without hesitation.

---

## Phase 6 — Case Study & Sales Asset 📝

**Why:** This is the highest-ROI work. Live reference customer (own company) is the only sales asset that converts without a long cycle. Everything else in this plan supports the demo — this is the thing that gets the meeting.

**This is not code.** Do in parallel with Phase 1–2.

**Steps:**

1. Write internal case study: _"How [Company] replaced spreadsheet KPI tracking"_
   - Before: spreadsheet chaos, no audit trail, review cycle pain
   - After: approval-tracked KPIs, competency snapshots, probation logging
   - One real number: "Cut review prep from X hours to Y" or "0 disputes in last review cycle"

2. Book one warm sales conversation (someone in your network, similar company size) before Phase 3 is done

3. Use the case study + live demo (own company's data) as the only sales collateral needed

**Done when:** One warm prospect has seen the demo and has a proposal in their inbox.

---

## Milestone Summary

| Phase | Work type | Blocker for? |
|---|---|---|
| 0 — Stop | Scope discipline | Everything else |
| 1 — Resend email | Config + test | Demo credibility |
| 2 — Audit trail UI | Frontend feature | Core selling point |
| 3 — Data export | Frontend feature | Trust / deal unlocker |
| 4 — CSV import | Frontend feature | Onboarding / setup fee |
| 5 — Backup story | Documentation | IT sign-off |
| 6 — Case study | Writing / sales | First paid customer |

Phases 1 and 6 run in parallel. Phases 2, 3, 4 are sequential (2 first, then 3, then 4). Phase 5 can run anytime.

**Total engineering effort estimate:** ~2–3 weeks of focused subtraction + targeted additions. Not new building.

---

## What "Done" Looks Like for MVP

A mid-market HR director can:
- Log in, see their company's KPI structure with approval history
- Submit a KPI target and receive an email when it's approved
- Open Audit Log → see who changed what and when → export to Excel
- Export competency assessment results for a performance review
- Ask "where's our data?" and get a clear, confident answer

That is the sellable product. Everything else is later.
