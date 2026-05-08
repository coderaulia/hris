-- ==================================================
-- Rollback: Role Scope and Access Extensions
-- Reverses: 20260308_role_scope_access.sql
-- Run as part of the rollback chain in reverse migration order.
-- ==================================================

BEGIN;

DROP POLICY IF EXISTS "Manager manage kpi definitions" ON public.kpi_definitions;
DROP POLICY IF EXISTS "Manager manage competency config" ON public.competency_config;
DROP POLICY IF EXISTS "Director delete kpi records by operational scope" ON public.kpi_records;
DROP POLICY IF EXISTS "Director update kpi records by operational scope" ON public.kpi_records;
DROP POLICY IF EXISTS "Director insert kpi records by operational scope" ON public.kpi_records;
DROP POLICY IF EXISTS "Director read all kpi records" ON public.kpi_records;
DROP POLICY IF EXISTS "Director update employees by operational scope" ON public.employees;
DROP POLICY IF EXISTS "Director read all employees" ON public.employees;

DROP FUNCTION IF EXISTS public.director_operational_scope_contains(TEXT);
DROP FUNCTION IF EXISTS public.is_director();

CREATE OR REPLACE FUNCTION public.can_access_employee(target_employee_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    is_superadmin()
    OR target_employee_id = auth_employee_id()
    OR EXISTS (
      SELECT 1
      FROM public.employees e
      WHERE e.employee_id = target_employee_id
        AND (
          e.manager_id = auth_employee_id()
          OR (is_manager() AND e.department = auth_department())
        )
    )
  );
$$;

DO $$
BEGIN
  ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_role_check;
  ALTER TABLE public.employees
    ADD CONSTRAINT employees_role_check
    CHECK (role IN ('superadmin', 'manager', 'employee'));
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'Skipped restoring pre-director employees_role_check because existing role values need cleanup first.';
END $$;

COMMIT;
