# Data Backup & Recovery

_Last updated: 2026-05-27_

---

## Architecture Overview

Each customer runs on a **dedicated Supabase project** (one database per customer). This provides:

- Full data isolation between customers
- Independent backup schedules
- Customer-specific access controls
- No shared-tenancy risk

---

## Automatic Backups

### Supabase Pro Plan (recommended for production)

| Feature | Detail |
|---|---|
| Daily backups | Automatic, retained for 7 days |
| Point-in-Time Recovery (PITR) | Restore to any second within the retention window |
| Retention | 7 days (Pro), 28 days (Team/Enterprise) |
| Storage | Managed by Supabase infrastructure |

Backups are automatic — no configuration required once the project is on Pro plan.

### Free/Starter Plan

| Feature | Detail |
|---|---|
| Daily backups | Automatic, retained for 7 days |
| PITR | Not available |
| Manual export | Available via Dashboard or CLI |

---

## On-Demand Database Export

Customers or administrators can export a full database dump at any time:

### Via Supabase Dashboard

1. Go to **Project Settings → Database → Backups**
2. Click **Download backup** for the desired date
3. File is a standard PostgreSQL dump (`.sql`)

### Via CLI

```bash
# Install Supabase CLI if not already available
# Export full database
supabase db dump --project-ref <project-id> -f backup.sql

# Export specific schema only
supabase db dump --project-ref <project-id> --schema public -f public_schema.sql
```

### Via pg_dump (direct connection)

```bash
pg_dump "postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres" \
  --no-owner --no-acl -f full_backup.sql
```

---

## Data Export for Customers

Customers can export their data in user-friendly formats at any time through the application:

| Module | Export Format | Access |
|---|---|---|
| Employee Directory | Excel / CSV | HR / Superadmin |
| KPI Records | Excel | HR / Superadmin |
| Assessment Records | Excel | HR / Superadmin |
| Probation & PIP | Excel / PDF | HR / Superadmin |
| Audit Log | Excel | HR / Superadmin |
| KPI Definitions | JSON / CSV | Superadmin |
| Organization Setup | JSON | Superadmin |

---

## Recovery Procedures

### Scenario: Accidental data deletion

1. Identify the timestamp of the deletion from the **Audit Log**
2. Use PITR (Pro plan) to restore to a point before the deletion
3. Or: restore from the most recent daily backup

### Scenario: Full project recovery

1. Create a new Supabase project
2. Apply migrations: `supabase db push`
3. Restore data from backup: `psql < backup.sql`
4. Update environment variables to point to new project
5. Redeploy edge functions: `supabase functions deploy`

### Scenario: Customer requests full data export

1. Generate database dump via CLI or Dashboard
2. Export all modules to Excel via the application
3. Provide both the raw SQL dump and Excel files to the customer

---

## Customer Data Ownership

- **All data belongs to the customer.** We are a data processor, not owner.
- Customers can request a full export at any time — we fulfill within 48 hours.
- On contract termination, we provide a final export and delete the project within 30 days.
- No data is shared between customer projects.

---

## Disaster Recovery SLA

| Metric | Target |
|---|---|
| Recovery Point Objective (RPO) | < 24 hours (daily backup), < 1 minute (PITR) |
| Recovery Time Objective (RTO) | < 4 hours for full restoration |
| Data retention after termination | 30 days, then permanent deletion |
| Export request fulfillment | Within 48 hours |

---

## Security Measures

- All data encrypted at rest (AES-256) by Supabase infrastructure
- All connections encrypted in transit (TLS 1.2+)
- Row Level Security (RLS) enforced on all tables
- Admin activity logged in `admin_activity_log` with full audit trail
- Database credentials rotated on schedule

---

## Contact

For data-related requests, backup restoration, or security concerns:

- **Technical support:** [configured per deployment]
- **Data export requests:** Submit via application Settings or contact HR admin
- **Emergency recovery:** Contact project administrator directly

---

## FAQ

**Q: What if Supabase goes down?**
A: Supabase runs on AWS with multi-AZ redundancy. In the unlikely event of extended downtime, we restore from the latest backup to a new provider.

**Q: Can we host on our own infrastructure?**
A: Yes. The application supports self-hosted Supabase. Contact us for deployment guidance.

**Q: How do we verify backups are working?**
A: Check Supabase Dashboard → Database → Backups. Daily backup timestamps are visible. We recommend quarterly restore tests.
