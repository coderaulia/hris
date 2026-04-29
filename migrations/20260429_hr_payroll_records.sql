-- ==================================================
-- HR payroll records for payslip generation
-- Date: 2026-04-29
-- Purpose:
-- - store one reusable salary/tax/benefit row per employee per payroll month
-- - support CSV import for payslip generation
-- Safe to re-run
-- ==================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.hr_payroll_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id TEXT NOT NULL REFERENCES public.employees(employee_id) ON DELETE CASCADE,
  payroll_period TEXT NOT NULL,
  payroll_cutoff_start DATE,
  payroll_cutoff_end DATE,
  grade_level TEXT,
  ptkp TEXT,
  npwp TEXT,
  nik_number TEXT,
  job_position TEXT,
  organization TEXT,
  basic_salary NUMERIC(14, 2) NOT NULL DEFAULT 0,
  overtime NUMERIC(14, 2) NOT NULL DEFAULT 0,
  commission NUMERIC(14, 2) NOT NULL DEFAULT 0,
  bonus NUMERIC(14, 2) NOT NULL DEFAULT 0,
  pph21 NUMERIC(14, 2) NOT NULL DEFAULT 0,
  bpjs_kes NUMERIC(14, 2) NOT NULL DEFAULT 0,
  bpjs_tk NUMERIC(14, 2) NOT NULL DEFAULT 0,
  other_deduction NUMERIC(14, 2) NOT NULL DEFAULT 0,
  bpjs_kes_company NUMERIC(14, 2) NOT NULL DEFAULT 0,
  bpjs_tk_company NUMERIC(14, 2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT hr_payroll_records_period_format
    CHECK (payroll_period ~ '^[0-9]{4}-[0-9]{2}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_payroll_records_employee_period
  ON public.hr_payroll_records (employee_id, payroll_period);

CREATE INDEX IF NOT EXISTS idx_hr_payroll_records_period
  ON public.hr_payroll_records (payroll_period);

ALTER TABLE public.hr_payroll_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read HR payroll records" ON public.hr_payroll_records;
DROP POLICY IF EXISTS "Manage HR payroll records" ON public.hr_payroll_records;
CREATE POLICY "Read HR payroll records"
ON public.hr_payroll_records FOR SELECT TO authenticated
USING (is_superadmin() OR is_hr_user());
CREATE POLICY "Manage HR payroll records"
ON public.hr_payroll_records FOR ALL TO authenticated
USING (is_superadmin() OR is_hr_user())
WITH CHECK (is_superadmin() OR is_hr_user());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_payroll_records TO authenticated;

COMMIT;
