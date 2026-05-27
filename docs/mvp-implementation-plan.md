# MVP Implementation Plan

_Based on: hr-suite-growth-audit.md × current project state (2026-05-27)_
_Goal: sellable governance product, not generic HRIS_

---

## Positioning (non-negotiable reframe)

Stop selling "HRIS." Sell:

> **Performance & governance layer that sits beside the payroll tool the company already runs.**

Pitch: _"Keep your Talenta/Gadjian. We do the KPI governance, competency tracking, and probation/PIP they do badly — with approval trails, snapshot-locked records, and Indonesian HR docs."_

This removes the rip-and-replace objection on first sales call.

---

## Phase 0 — Stop (immediate, before touching any code) ✅

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

## Phase 1 — Email Delivery via Resend ✉️ — CODE COMPLETE ✅

**Why first:** Approval workflows feel fake without email. KPI approvals, probation decisions, PIP updates all dispatch notifications — but currently skip delivery because secrets are missing. This is demo-critical.

**Current state:** `supabase/functions/approval-notifications/index.ts` is fully implemented with Resend provider support. Falls back to dry-run mode when secrets are missing.

**Remaining (config-only, no code):**

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

## Phase 2 — Visible Audit Trail Screen 🔍 — DONE ✅

**Why:** `admin_activity_log` is written. For a governance product, the viewable audit log IS the selling point.

**Implemented:**
- ✅ Dedicated "Audit Log" tab in Settings (HR/superadmin only) with navigation item
- ✅ Full filterable table: Timestamp | User | Action | Module | Record ID | Details
- ✅ Filter by: module (KPI / Assessment / Probation / PIP / Employee / Documents / Settings / Organization), date range, user
- ✅ Actor name resolution from employee database
- ✅ "Export Audit Log" button → Excel via exceljs (client-side)
- ✅ Users & Roles section shows last 10 entries with link to full log
- ✅ `logActivity()` called on all meaningful mutations across modules

**Done:** HR director can open Settings → Audit Log, see who approved a KPI target, filter by module/date/user, and export to Excel.

---

## Phase 3 — User-Facing Data Export 📊 — DONE ✅

**Why:** Mid-market buyers won't commit data without an exit. "Export all to Excel" per module is a trust signal AND a sale unlocker.

**Implemented:**

| Module | Export | Status |
|---|---|---|
| KPI Governance | Department KPI Excel/PDF, Employee KPI PDF (edge function) | ✅ |
| KPI Records | Client-side Excel export with filters | ✅ |
| Assessments | Client-side Excel export (scores per employee per period) | ✅ |
| Probation / PIP | Excel + PDF export | ✅ |
| Employee Directory | CSV export + Excel export | ✅ |
| Audit Log | Excel export with active filters | ✅ |

**Shared utility:** `src/lib/exportUtils.js` — `exportToExcel(rows, filename, options)` and `exportToCSV(rows, filename)` using exceljs client-side.

**Done:** HR director can export KPI results, assessment records, employee directory, and audit log to Excel in under 3 clicks.

---

## Phase 4 — CSV Import for Onboarding 📥 — DONE ✅

**Why:** Mid-market buyer has 50–250 employees in a spreadsheet. If they can't import, onboarding blocks the deal.

**Implemented:**

1. **Employee CSV import** ✅
   - Template: `ID, Name, Position, Seniority, Join_Date, Department, Manager_ID, Role, Email`
   - Full validation, duplicate detection, preview table, confirmation dialog
   - Import summary: N created, N updated, N errors with row numbers
   - Activity logging on import

2. **KPI Definition import** ✅
   - JSON import (existing): full KPI definition array
   - CSV import (new): `kpi_name, department, position, target, unit, period, description`
   - Downloadable CSV template button
   - Validation, preview, and confirmation flow

**Done:** Can onboard a 50-person company from spreadsheet to working KPI tracking in one session.

---

## Phase 5 — Backup & Recovery Story 📋 — DONE ✅

**Why:** Buyer's IT will ask "what if you disappear or data is lost?" Not having an answer kills the deal silently.

**Delivered:**

- ✅ `docs/data-backup-recovery.md` — comprehensive document covering:
  - Supabase automatic daily backups + PITR
  - On-demand export procedures (Dashboard, CLI, pg_dump)
  - Customer data ownership policy
  - Recovery procedures for common scenarios
  - Disaster recovery SLA (RPO/RTO targets)
  - Security measures summary
  - FAQ for non-technical buyers

**Done:** Can answer "what happens to our data?" in a sales call without hesitation.

---

## Phase 6 — Case Study & Sales Asset 📝

**Why:** This is the highest-ROI work. Live reference customer (own company) is the only sales asset that converts without a long cycle.

**This is not code.** Do in parallel with Phase 1 config.

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

| Phase | Work type | Status | Blocker for? |
|---|---|---|---|
| 0 — Stop | Scope discipline | ✅ Done | Everything else |
| 1 — Resend email | Config + test | ✅ Code complete (needs secrets) | Demo credibility |
| 2 — Audit trail UI | Frontend feature | ✅ Done | Core selling point |
| 3 — Data export | Frontend feature | ✅ Done | Trust / deal unlocker |
| 4 — CSV import | Frontend feature | ✅ Done | Onboarding / setup fee |
| 5 — Backup story | Documentation | ✅ Done | IT sign-off |
| 6 — Case study | Writing / sales | ⏳ Pending | First paid customer |

---

## What "Done" Looks Like for MVP

A mid-market HR director can:
- ✅ Log in, see their company's KPI structure with approval history
- ⏳ Submit a KPI target and receive an email when it's approved _(needs Resend secrets)_
- ✅ Open Audit Log → see who changed what and when → export to Excel
- ✅ Export competency assessment results for a performance review
- ✅ Ask "where's our data?" and get a clear, confident answer

That is the sellable product. Everything else is later.

---

## Product Roadmap

### 🚀 Coming Soon

| Feature | Description |
|---|---|
| **Live Attendance** | Picture and GPS-location based attendance capture from mobile. Employees clock in/out with selfie + geolocation proof. |

### 🔨 On Progress (In Development)

| Feature | Description |
|---|---|
| **Manpower Planning** | Headcount planning, gap analysis, and approval workflow by department. Hidden via `VITE_ENABLED_MODULES` until complete. |
| **Recruitment Board** | Candidate pipeline tracking from approved headcount through hiring stages to onboarding. |

### 🎯 Custom Features Upon Request

We build custom modules tailored to your company's specific HR processes. Examples:

- Custom approval workflows (multi-level, cross-department)
- Industry-specific compliance tracking
- Integration with existing payroll systems (Talenta, Gadjian, etc.)
- Custom report templates and dashboards
- Overtime and shift management
- Leave management with approval chains
- Employee self-service portal customization

_Contact us to discuss your requirements and get a scoping estimate._
