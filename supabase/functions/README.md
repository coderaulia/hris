# Supabase Edge Functions

Current status:

- `admin-user-mutations`: implemented first-pass privileged user management
- `approval-notifications`: implemented first-pass recipient resolution and provider-ready email dispatch
- `auth-callbacks`: implemented first-pass callback normalization and profile resolution
- `report-exports`: implemented end-to-end binary generation with Storage-backed signed download URLs

## Required secrets

Set these in the Supabase project before deploying:

- `URL`
- `ANON_KEY`
- `SERVICE_ROLE_KEY`
- `REPORT_EXPORT_BUCKET` optional, defaults to `report-exports`

Full deploy checklist:

- [docs/supabase-functions-deploy.md](/c:/Users/Administrator/Documents/hris-vanaila/docs/supabase-functions-deploy.md)

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
