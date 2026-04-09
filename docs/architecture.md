# Architecture

Last updated: 2026-04-08

## High-Level Diagram

```
Browser (Vite SPA)
│
├── Supabase Auth          ← sign-in, session restore, sign-out, password flows
├── Supabase Postgres      ← all live data (RLS enforced)
│   ├── settings           ← org branding, config
│   ├── employees          ← employee records
│   ├── competency_config  ← competency framework definitions
│   ├── assessments        ← competency assessment records
│   ├── training           ← training log entries
│   ├── kpi_governance     ← KPI definitions, targets, approvals
│   ├── probation_pip      ← probation and PIP records
│   └── activity_logs      ← audit trail
└── /healthz.json          ← static health check (no server needed)
```

## Data Access Model

```
Request path:
  Browser → Supabase Data API → RLS policy check → Postgres table

Required grants (must exist on every environment):
  GRANT USAGE ON SCHEMA public TO anon, authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE ON <tables> TO anon, authenticated;

RLS policies define row-level access per role.
Missing grants = silent failure even when RLS looks correct.
```

## Role Hierarchy

```
anon
  └── can fetch: settings/branding (login page needs this)

authenticated (base post-login)
  └── can access: own profile, own training logs

hr (elevated)
  └── can access: all employee data, assessments, KPIs, probation/PIP

superadmin
  └── full access + user creation
```

## Environment Setup Checklist

1. Create Supabase project
2. Run **fresh-project SQL bootstrap** (creates schema + tables)
3. Run **Data API grants migration** (grants anon + authenticated access)
4. Apply **RLS policies** (row-level access rules)
5. Run **demo seed** (optional, for testing)
6. Set production env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
7. Deploy static build to Hostinger
8. Verify login → profile resolution → role assignment

## Module Boundaries

| Module | Tables Used | Notes |
|---|---|---|
| Auth | *(Supabase managed)* | Browser-side only |
| Settings | `settings` | Fetched on app load for branding |
| Employees | `employees` | Core entity |
| Assessments | `competency_config`, `assessments` | Config-driven scoring |
| Training | `training` | Per-employee log |
| KPI | `kpi_governance` | Approval workflow included |
| Probation/PIP | `probation_pip` | Triggered from employee records |
| Dashboard | all read | Aggregated, browser-rendered |
| Audit | `activity_logs` | Written on mutations |

## Future Backend (Optional)

If a backend is ever added, scope it to:
- Auth redirect handling (OAuth callbacks)
- Heavy export generation (PDF, Excel server-side)
- Approval notification emails
- Private/automated backup jobs

Do NOT replicate Supabase data access through a backend proxy — keep direct Supabase SDK calls from the browser for all CRUD.
