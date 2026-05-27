# HR Performance Suite — Product Growth Audit

_Prepared as a product-growth assessment. Focus: market fit, positioning, MVP scope, go-to-market, monetization._

---

## Inputs (your answers)

- **Buyer today:** Own company is actively using it (live reference customer).
- **Target size:** Indonesian mid-market, 50–250 employees.
- **Claimed differentiator:** KPI / competency governance depth.
- **Runway:** Revenue needed ASAP.

---

## Verdict

The code is **over-built, not under-built**. The risk is not engineering quality — it's positioning.

Positioned as "another HRIS," this is a slop project: the Indonesian market is crowded and consolidating around payroll-first incumbents (Talenta, Gadjian, GreatDay, LinovHR, SunFish) who own the "get off spreadsheet payroll" job. You have no payroll, attendance, BPJS, or PPh 21 — and you should never add them. That race is un-winnable.

Repositioned correctly, it is **not slop**. You have a real wedge and a live reference customer most founders never get.

---

## Positioning fix (the whole game)

Stop selling "an HRIS." Sell a **performance & governance layer that sits beside the payroll system the company already runs.**

Every 50–250 company already pays for Talenta/Gadjian/GreatDay for payroll/attendance/compliance and will **not** rip it out. Those tools treat KPI/competency as a shallow premium add-on. That gap is the wedge.

**Pitch:** _"Keep your payroll. We do the performance governance Talenta does badly — KPI versioning with approval trails, snapshot-locked scoring, competency frameworks, probation/PIP — built for Indonesian mid-market."_

This makes you a **complement, not a competitor**, and removes the rip-and-replace objection that kills new HRIS sales.

---

## The two genuine wedges

1. **Performance governance depth** — KPI versioning, target-version approvals, snapshot-locked records, weighting, competency frameworks, probation/PIP. Deeper than the payroll-first tools' bolt-on performance features. This is the core product.
2. **Indonesian HR document automation** — PKWT/PKWTT/PKHL contracts, SP (warning letter) workflows with legal metadata, termination docs. Real legal-adjacent pain incumbents barely touch. Sell as a **separate upsell module**, not core MVP.

---

## MVP scope — subtraction, not addition

### CUT (stop spending time here)
- **Laravel dual-backend / adapter pattern** — biggest time sink, zero customer value. Pick Supabase, delete the Laravel path from MVP. Two backends before one paying customer = slop engineering.
- **Manpower planning module** — incomplete, not the wedge. Park it.
- **Payslip generation in HR Documents** — overlaps payroll (their existing tool's job), weak without real payroll data. Drop from MVP.

### KEEP (the sellable core)
- KPI governance — definitions, versions, target-version approvals, snapshot-locked records, weighting
- Competency assessment + framework config
- Probation / PIP workflows
- Performance dashboard + department drill-down
- Minimal employee directory + role-based access
- Branding / settings (white-label matters for mid-market)

### ADD (MVP blockers, not nice-to-haves)
- **Working email delivery (Resend)** — approval workflows feel fake without notifications. **Priority #1.**
- **Tenancy decision: deploy per-customer instances** (own Supabase project each). Do **not** rebuild multi-tenancy now. Viable at 50–250 scale; consolidate later. Multi-tenant only worth it past ~10 customers.

---

## Additional gaps that block a sale or break trust

These are table stakes a mid-market buyer will check — separate from features.

### Must-add before charging anyone
- **Visible audit trail** — you log to `admin_activity_log`, but an HR director needs a *screen*: who changed this KPI target, when, approved by whom. For a governance product, a viewable audit log is the selling point. Surface it.
- **Data export ("get my data out")** — clean "export all to Excel" per module. You have `exceljs`; make it user-facing and complete. Mid-market won't commit data without an exit.
- **Backup + recovery story** — per-customer Supabase instances need documented backup. Buyers' IT will ask "what if you disappear / data is lost." Have an answer.
- **Onboarding / data import** — working CSV import for employee directory + KPI definitions. Repoint the existing payroll CSV plumbing.

### Add only if a paying prospect names it as a blocker
- SSO / Google login
- Bulk operations (bulk assign KPIs, bulk assessment)
- Notification preferences (who gets emailed what)

### Do NOT add (slop traps)
- Payroll, attendance, BPJS, PPh 21 — never. Un-winnable race.
- Multi-tenancy — not until 2–3 paying customers.
- Manpower planning, payslip generation — parked.
- Mobile app — incumbents win on mobile attendance; this is desk-HR work. Responsive web is enough.

---

## Go-to-market (revenue-ASAP sequence)

> Reality check: mid-market HR sales cycles run 1–3 months even with warm intros. "ASAP" comes from your network sold as a managed deployment with an upfront fee — not self-serve signups, not competing with Talenta head-on.

1. **Write the case study from your own company first.** _"How [company], an [X]-person firm, replaced spreadsheet KPI tracking and cut review cycles by [Y]."_ Get one real number. This is your entire sales asset.
2. **Cut MVP to core + Resend.** ~2–3 weeks of subtraction and one feature, not new building.
3. **Sell to 3–5 warm targets** — companies your size reachable without cold outreach. Offer a **paid pilot**, not free. Free pilots don't convert and don't pay rent.
4. **Deploy per-customer instances manually.** Don't automate provisioning until it hurts.
5. **Only after 2–3 paying customers**, decide on multi-tenancy and self-serve.

Steps 1 and 3 run **in parallel** with step 2. Selling before fully done is the point.

---

## Monetization

Per-seat alone accrues too slowly for "ASAP." Use a two-part model:

| Component | Model | Range | Purpose |
|---|---|---|---|
| **Setup / implementation** | One-time | Rp 8–25 juta | Immediate cash; covers onboarding, framework config, data import, training; filters serious buyers |
| **Subscription** | Per-employee / month | Rp 15–30k | Recurring; priced as governance layer, not commodity payroll |
| **HR Documents** | Module upsell | Rp 1–3 juta/mo or per-doc | Second revenue line once core is in |

- Gadjian sits ~Rp 12,500/employee/month for **payroll**. You are a different, higher-value, lower-volume job, so per-seat can match or exceed without competing on price.
- At 50–250 employees: roughly **Rp 750k–7.5 juta/month recurring per customer**, plus the setup fee upfront.
- Five customers → meaningful MRR; setup fees fund the gap while subscriptions accumulate.

---

## Bottom line

The code isn't the risk — you've over-delivered on engineering. The risk is positioning it as a generic HRIS and burning weeks on the Laravel backend instead of selling the governance wedge you already proved works at your own company.

**Subtract, reposition, sell to your network with a setup fee. That's the ASAP path.**

The tell that you're slipping back into slop: building a feature no specific prospect has asked for. When that happens, stop.

### Immediate next 3 things
1. Email delivery (Resend) working.
2. Audit log + export made **visible** to the customer.
3. Case study written + one warm sales conversation booked.
