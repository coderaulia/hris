# Schema Discipline

## One Deterministic Pattern

This repository uses exactly two schema entrypoints:

1. `complete-setup.sql`
   Fresh-environment bootstrap snapshot.

2. `migrations/YYYYMMDD_description.sql`
   Append-only incremental schema changes for every change after the bootstrap snapshot.

There should be no other schema SQL entrypoints in the repository.

## Rules

### 1. Every schema change needs a numbered migration
- New table
- Altered column
- New policy
- Changed grant
- New function used by RLS
- New index

If the database behavior changes, a migration file must be added in `migrations/`.

### 2. `complete-setup.sql` is the fresh-install snapshot
Use it to bring up a brand-new environment in one pass.

It should reflect the latest expected schema and security model for a clean install.

### 3. Migrations remain append-only
Do not rewrite old migrations unless they are broken and unreleased.

For released schema changes, add a new migration instead of mutating prior migration history.

### 4. No parallel bootstrap files
Do not add additional SQL bootstrap files under `supabase/`, `scripts/`, or other folders.

That creates drift between environments and makes deployments non-deterministic.

## Fresh Environment Flow

1. Run `complete-setup.sql`
2. Run all numbered files in `migrations/` in lexical order

This is the only supported database bootstrap path.

## CI Guardrails

`npm run qa:hardening` now enforces:

- schema SQL only exists in allowed locations
- migration naming and transaction wrappers
- RLS policy expectations
- Data API grants for anon/authenticated roles

If any of these fail, CI should block deployment.
