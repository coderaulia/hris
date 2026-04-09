# Supabase Edge Functions

Current status:

- `admin-user-mutations`: implemented first-pass privileged user management
- `approval-notifications`: implemented first-pass recipient resolution and provider-ready email dispatch
- `auth-callbacks`: implemented first-pass callback normalization and profile resolution
- `report-exports`: implemented first-pass server-side dataset preparation for KPI/probation exports

## Required secrets

Set these in the Supabase project before deploying:

- `URL`
- `ANON_KEY`
- `SERVICE_ROLE_KEY`

## First deploy targets

```bash
supabase functions deploy admin-user-mutations
supabase functions deploy auth-callbacks
supabase functions deploy approval-notifications
supabase functions deploy report-exports
```

## Implemented actions

`admin-user-mutations` currently supports:

- `create_managed_user`
- `update_employee_role`

Both actions require a valid authenticated caller linked to an `employees` row with the `superadmin` role.
