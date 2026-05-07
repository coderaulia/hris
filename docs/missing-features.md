# Missing Features

Known product gaps confirmed by current docs and code shape. Track implementation progress here.

## HR Document Archive

Persistent archive table and storage flow for generated HR documents. Currently documents are generated client-side only — no record is saved after generation.

## E-Signature Workflow

Full e-signature or approval-sign sequence for generated documents. No signing or approval step exists after a document is produced.

## Production Notification Provider

`approval-notifications` edge function supports dry-run fallback when email secrets are absent. Requires production provider secrets configured before live outbound delivery works.

## Payroll Import QA

Payroll CSV import stores rows per employee/month. Manual QA still needed against production-like employee IDs and payslip PDF output to verify end-to-end correctness.

## Migration Rollback Scripts

`claude.md` expects paired rollback scripts for every migration. Existing migrations in `backend/database/migrations/` and `migrations/` do not include rollback counterparts.

## Bundle Size: pdf-vendor

Large `pdf-vendor` chunk still exists. Further splitting or lazy-loading needed for first-load performance.
