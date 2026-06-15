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

## Phase 7 — Live Attendance 📍📷 — SUPABASE CODE COMPLETE ✅

**Status (2026-06-15):** Supabase path built end-to-end — migration `20260615_live_attendance.sql`
(+ rollback) registered in the canonical chain, `backend.attendance` adapter methods (Supabase real,
Laravel stubs), `src/modules/data/attendance.js` data module, and the `src/modules/attendance.js`
records sub-view (mobile selfie capture + geolocation + geofence, my-punch history, HR team log with
Excel export). Module gated by `VITE_ENABLED_MODULES=attendance`. **Remaining (config):** run the
migration on the target Supabase project and add `attendance` to `VITE_ENABLED_MODULES`.

---

### Original plan

**Why:** First true employee-self-service feature with daily active use. Picture + GPS clock in/out is the most-requested HRIS commodity feature in the Indonesian market and the natural mobile entry point — it gets every employee into the app daily, which seeds adoption for everything else.

**Scope:** Mobile-web (no native app). Employee opens the app on their phone, grants location + camera, and clocks in/out with a selfie and geolocation proof. HR sees a filterable, exportable attendance log. Punches are immutable for employees; HR can correct.

### Schema (additive migration: `migrations/YYYYMMDD_live_attendance.sql` + rollback)

| Table | Key columns |
|---|---|
| `attendance_work_sites` | `id`, `name`, `latitude`, `longitude`, `radius_m`, `active`, timestamps — optional geofence anchors |
| `attendance_records` | `id`, `employee_id`, `event_type` (`clock_in`\|`clock_out`), `event_time` (timestamptz), `latitude`, `longitude`, `accuracy_m`, `address` (nullable text), `photo_storage_path`, `work_site_id` (nullable FK), `within_geofence` (bool), `device_info` (jsonb), `note`, `corrected_by` (nullable), `created_at` |

- View `attendance_daily` — per employee per day: first `clock_in`, last `clock_out`, derived `worked_minutes`, `late` flag (vs configurable start time). Security-invoker; base-table RLS applies.
- One row per punch event (not per day) — keeps the record immutable and audit-friendly.

### Storage + RLS

- Private bucket `attendance-photos`, path `{employee_id}/{date}/{record_id}.jpg`. Mirror the `document-signatures` bucket pattern.
- RLS on `attendance_records`: employee `INSERT` own + `SELECT` own; manager `SELECT` team; HR/superadmin `SELECT` all + `UPDATE` (corrections). No employee `UPDATE`/`DELETE` — punches are immutable.
- Storage policy: employee reads own photos; HR/superadmin read all (SECURITY DEFINER helper like `can_read_signature_archive_object`).

### Backend surface (`backend.attendance`)

- `recordEvent({ employee_id, event_type, geo, photoBlob })` — uploads photo then inserts row (Supabase adapter).
- `listMyAttendance(employeeId, range)`, `listAttendance(filters)`, `getAttendancePhotoUrl(path)`.
- Work-site CRUD: `listWorkSites()`, `upsertWorkSite()`, `deleteWorkSite()`.
- Laravel adapter: graceful stubs until parity lands (same precedent as signatures).

### Frontend

- New module `attendance` in `src/config/app-modules.js` MODULE_REGISTRY (deps `core`, `employees`); enable via `VITE_ENABLED_MODULES`.
- Data module `src/modules/data/attendance.js`; feature module `src/modules/attendance.js`.
- **Mobile capture flow:**
  1. `navigator.geolocation.getCurrentPosition` — capture lat/lng + accuracy; reject if accuracy worse than threshold.
  2. Camera: `getUserMedia({ video: { facingMode: 'user' } })` with `<input capture="user">` fallback for unsupported browsers.
  3. Compress selfie client-side via canvas (target ~200–400 KB JPEG) before upload.
  4. Optional geofence check against `attendance_work_sites` (Haversine); store `within_geofence`.
  5. Confirm → upload photo → insert event → success toast (SweetAlert2 wrapper).
- Mobile-first focused screen; gate desktop to the HR log view.
- HR view: filterable table (employee / date range / site / geofence flag), thumbnail preview, map link from lat/lng, Excel export via `src/lib/exportUtils.js`.

### Cross-cutting

- `logActivity()` on each clock event and HR correction (module `Attendance`).
- Add to `docs/db-schema.md`, `docs/api-endpoints.md`, `docs/env-guide.md` (bucket name), `complete-setup.sql`, and the canonical migration chain.

### Build order

1. Migration + rollback + bucket + RLS → `npm run qa:hardening`.
2. Supabase adapter methods + data module.
3. Mobile capture UI (geo + camera + compress + upload).
4. HR log view + filters + export.
5. Optional work-site geofence config in Settings.
6. Audit logging + docs.

**Done when:** An employee on their phone clocks in with a selfie + location, and HR sees the punch with photo, coordinates, and timestamp in a filterable, exportable log.

---

## Phase 8 — Leave Management (Cuti & Izin) 🏖️ — PLANNED

**Why:** Pairs with attendance to make the self-service surface complete and is the second commodity feature buyers expect. Indonesian leave types (cuti tahunan, cuti spesial, izin, sakit) with balance tracking and an approval chain reuse the approval/notification machinery already built for KPI/probation/PIP.

**Scope:** Employee submits a leave request (type, dates, reason, optional attachment), manager/HR approves or rejects, balances decrement on approval. Employee sees remaining balance per type; HR sees all requests and a balance report.

### Leave types (seeded in `leave_types`)

| Code | Name (ID) | Paid | Quota | Attachment |
|---|---|---|---|---|
| `cuti_tahunan` | Cuti Tahunan (annual) | yes | 12 days/yr (configurable) | no |
| `cuti_spesial` | Cuti Spesial (marriage, bereavement, maternity/paternity) | yes | per-event entitlement | optional |
| `izin` | Izin (personal permission) | configurable | none / capped | no |
| `sakit` | Sakit (sick) | yes | none | doctor note if > N days |

### Schema (additive migration: `migrations/YYYYMMDD_leave_management.sql` + rollback)

| Table | Key columns |
|---|---|
| `leave_types` | `id`, `code`, `name_id`, `name_en`, `is_paid`, `default_quota_days`, `requires_attachment`, `active` |
| `leave_balances` | `id`, `employee_id`, `leave_type_id`, `year`, `entitled_days`, `used_days`, `carried_over_days`, timestamps — unique `(employee_id, leave_type_id, year)` |
| `leave_requests` | `id`, `employee_id`, `leave_type_id`, `start_date`, `end_date`, `days_count`, `half_day` (bool), `reason`, `attachment_storage_path` (nullable), `status` (`pending`\|`approved`\|`rejected`\|`cancelled`), `approver_id` (nullable), `decided_at`, `decision_note`, `created_by`, timestamps |

- View `leave_balance_overview` — per employee per type per year: `entitled + carried_over`, `used`, derived `remaining`.
- `days_count` = working days between start/end excluding weekends (public-holiday exclusion is a follow-up; optional `public_holidays` table).

### Storage + RLS

- Private bucket `leave-attachments`, path `{employee_id}/{request_id}.{ext}` for sick notes.
- RLS on `leave_requests`: employee `INSERT`/`SELECT` own + `UPDATE` own only while `pending` (cancel); manager `SELECT`/approve team; HR/superadmin manage all. `leave_balances`: employee `SELECT` own; HR/superadmin manage. `leave_types`: authenticated read, HR/superadmin write.

### Approval + notifications

- Reuse the `approval-notifications` Edge Function — add `action: "leave_requests"` (alongside existing `employee_kpi_target_versions`, `probation_reviews`, `pip_plans`, `document_signature_requests`).
- On approval: increment `leave_balances.used_days` by `days_count` (transactional / RPC to avoid races). On rejection/cancel of an approved request: roll back the decrement.
- Block submission that exceeds remaining balance for quota-tracked types (validate at route entry).

### Backend surface (`backend.leave`)

- `listLeaveTypes()`, `upsertLeaveType()`.
- `listMyLeave(employeeId)`, `listLeaveRequests(filters)`, `createLeaveRequest(row, attachmentBlob?)`, `decideLeaveRequest(id, { status, decision_note })`, `cancelLeaveRequest(id)`.
- `listMyBalances(employeeId, year)`, `listBalances(filters)`, `upsertBalance()`.
- `getLeaveAttachmentUrl(path)`.
- Laravel adapter: graceful stubs until parity lands.

### Frontend

- New module `leave` in MODULE_REGISTRY (deps `core`, `employees`); enable via `VITE_ENABLED_MODULES`.
- Data module `src/modules/data/leave.js`; feature module `src/modules/leave.js`.
- Employee view: balance cards per type, request form (type, date range, half-day, reason, attachment), request history with status.
- Manager/HR view: pending approvals queue, approve/reject with note, full requests table + filters, balance report, Excel export via `exportUtils`.

### Cross-cutting

- `logActivity()` on submit, approve, reject, cancel (module `Leave`).
- Add to `docs/db-schema.md`, `docs/api-endpoints.md`, `docs/env-guide.md`, `complete-setup.sql`, canonical migration chain, and `supabase/01_dummy_seed.sql` (seed `leave_types` + sample balances).

### Build order

1. Migration + rollback + `leave_types` seed + balances + buckets + RLS → `npm run qa:hardening`.
2. Supabase adapter methods + data module + balance-decrement RPC.
3. Employee request UI (form + attachment + balance cards).
4. Approval queue + notification action wiring.
5. HR requests table + balance report + export.
6. Audit logging + docs.

**Done when:** An employee submits cuti tahunan, the manager gets an email and approves it, the annual balance decrements, and HR can export the leave register and balance report.

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
| 7 — Live Attendance | Frontend + schema + storage | ✅ Supabase code complete (needs migration run + module flag) | Daily active adoption / mobile entry |
| 8 — Leave Management | Frontend + schema + approvals | 📋 Planned | Self-service completeness |

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

### 🔨 On Progress (In Development)

| Feature | Description |
|---|---|
| **Live Attendance** | Picture and GPS-location based attendance capture from mobile web. Employees clock in/out with selfie + geolocation proof. See Phase 7. |
| **Leave Management** | Cuti tahunan, cuti spesial, izin, and sakit requests with per-type balances and an approval chain. See Phase 8. |
| **Manpower Planning** | Headcount planning, gap analysis, and approval workflow by department. Hidden via `VITE_ENABLED_MODULES` until complete. |
| **Recruitment Board** | Candidate pipeline tracking from approved headcount through hiring stages to onboarding. |

### 🎯 Custom Features Upon Request

We build custom modules tailored to your company's specific HR processes. Examples:

- Custom approval workflows (multi-level, cross-department)
- Industry-specific compliance tracking
- Integration with existing payroll systems (Talenta, Gadjian, etc.)
- Custom report templates and dashboards
- Overtime and shift management
- Employee self-service portal customization

_Contact us to discuss your requirements and get a scoping estimate._
