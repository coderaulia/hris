-- ==================================================
-- Rollback: HR Payroll Records
-- Reverses: 20260429_hr_payroll_records.sql
-- Run as part of the rollback chain in reverse migration order.
-- ==================================================

BEGIN;

REVOKE SELECT, INSERT, UPDATE, DELETE ON public.hr_payroll_records FROM authenticated;

DROP POLICY IF EXISTS "Manage HR payroll records" ON public.hr_payroll_records;
DROP POLICY IF EXISTS "Read HR payroll records" ON public.hr_payroll_records;

DROP TABLE IF EXISTS public.hr_payroll_records;

COMMIT;
