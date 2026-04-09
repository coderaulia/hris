# Edge Functions Plan

Last updated: 2026-04-09

## Goal

Use Supabase Edge Functions only where the browser is the wrong trust boundary or the wrong runtime:

- auth callbacks and redirect normalization
- heavy PDF/Excel exports
- approval email notifications
- sensitive superadmin auth/user mutations

Keep normal application CRUD in the browser through the Supabase JS client:

- employees
- assessments
- training logs
- KPI data
- ordinary user-scoped reads and writes

This preserves the current RLS-first architecture and avoids turning the app into a custom API server.

## Guiding Rule

Use Edge Functions for work that is:

- privileged
- cross-system
- long-running or memory-heavy
- secret-bearing

Do not move normal table CRUD behind Edge Functions just for consistency.

## Planned Function Domains

### 1. `auth-callbacks`

Purpose:

- normalize OAuth and magic-link callback handling
- resolve post-login employee role/profile server-side
- return a stable redirect target and boot payload

Why:

- current redirect/login recovery flows are sensitive to browser-side callback timing
- server-side callback normalization reduces redirect instability and profile-linking races

Expected responsibilities:

- validate callback state and redirect target
- exchange/normalize callback parameters
- resolve `auth.users` identity to employee profile
- return canonical role/bootstrap metadata to the SPA
- handle password recovery and magic-link redirects cleanly

Suggested shape:

- `supabase/functions/auth-callbacks`
- SPA callback page invokes function, then redirects into the app shell with normalized state

### 2. `report-exports`

Purpose:

- move large PDF/Excel generation out of the browser

Why:

- browser-side Excel/PDF generation is slow on large datasets
- large reports can crash or freeze the client
- Edge Functions can generate files with better control and either stream or persist them

Initial export candidates:

- probation PDF
- probation Excel
- department KPI PDF
- department KPI Excel

Suggested output pattern:

- for smaller reports: direct streamed response
- for larger reports: write to Storage and return a signed URL

### 3. `approval-notifications`

Purpose:

- send approval-related emails for KPI and probation workflows

Why:

- email delivery needs provider secrets and server-side execution
- Postgres webhook -> Edge Function is a clean event-driven pattern

Suggested trigger sources:

- `kpi_definition_versions`
- `employee_kpi_target_versions`
- `probation_reviews`
- optionally `pip_plans` for escalation notices

Expected responsibilities:

- load related employee/manager/HR metadata
- render and send notification emails
- log delivery status for auditability and retries

### 4. `admin-user-mutations`

Purpose:

- move sensitive auth-user creation and privileged account mutations off the client

Why:

- superadmin user creation should not depend on browser-side privileged calls
- service-role operations belong on the server boundary

Initial server-side operations:

- create managed auth user
- invite/reset managed auth user
- link/unlink auth identity from employee record
- privileged role/account mutations

Expected responsibilities:

- verify caller role from JWT + database
- execute privileged auth mutation with service-role key
- write audit log entries
- return minimal safe response payloads

## What Stays Client-Side

The following should remain direct Supabase browser SDK calls:

- employee CRUD
- assessment workflows
- training log CRUD
- KPI record CRUD
- ordinary settings reads
- role-scoped user reads/writes already enforced by RLS

Reason:

- lower latency
- simpler architecture
- less duplication of RLS logic
- avoids unnecessary API proxying

## Suggested Repository Layout

### Edge Functions

- `supabase/functions/auth-callbacks`
- `supabase/functions/report-exports`
- `supabase/functions/approval-notifications`
- `supabase/functions/admin-user-mutations`

### Client wrappers

- `src/lib/edge/auth.js`
- `src/lib/edge/exports.js`
- `src/lib/edge/notifications.js`
- `src/lib/edge/admin.js`

The SPA should call small wrapper helpers instead of embedding `supabase.functions.invoke(...)` directly in UI modules.

## Rollout Order

### Phase 1: `admin-user-mutations`

Best first security win with limited UI disruption.

### Phase 2: `auth-callbacks`

Best fix for redirect, magic-link, and post-login role resolution instability.

### Phase 3: `approval-notifications`

Good event-driven addition with minimal impact to current CRUD flows.

### Phase 4: `report-exports`

Largest implementation surface, but strong UX and reliability payoff for large datasets.

## Function Guardrails

Every Edge Function should:

- validate JWT and caller role explicitly
- enforce authorization in function code
- use service-role only when necessary
- log sensitive actions
- return stable machine-readable errors
- avoid becoming a generic CRUD pass-through

## Implementation Notes

### Auth callbacks

Prefer one stable callback URL and one normalized redirect contract instead of scattered client-only hash/query parsing.

### Export jobs

If exports may exceed Edge runtime comfort, use:

1. request export
2. generate file in function
3. save to Storage
4. return signed URL

### Notifications

Use a webhook/event table pattern that is easy to replay for failed deliveries.

### Admin mutations

Add audit logging for:

- actor
- target user
- mutation type
- timestamp
- outcome

## Out of Scope

This plan does not propose:

- moving all reads/writes behind Edge Functions
- replacing RLS with custom backend authorization
- introducing a separate API server

The architecture remains Supabase-first, with Edge Functions only where they materially improve security, reliability, or performance.
