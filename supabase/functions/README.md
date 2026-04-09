# Supabase Edge Functions

Current status:

- `admin-user-mutations`: implemented first-pass privileged user management
- `auth-callbacks`: scaffolded
- `approval-notifications`: scaffolded
- `report-exports`: scaffolded

## Required secrets

Set these in the Supabase project before deploying:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

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
