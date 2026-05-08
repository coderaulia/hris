-- ==================================================
-- Rollback: Security + QA Hardening
-- Reverses: 20260309_security_qa_hardening.sql
-- Run as part of the rollback chain in reverse migration order.
-- ==================================================

BEGIN;

DROP POLICY IF EXISTS "Manage competency config by position scope" ON public.competency_config;
DROP POLICY IF EXISTS "Manage KPI definitions by category" ON public.kpi_definitions;

DROP FUNCTION IF EXISTS public.can_manage_competency_position(TEXT);

CREATE OR REPLACE FUNCTION public.can_manage_kpi_category(target_category TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    is_superadmin()
    OR EXISTS (
      SELECT 1
      FROM public.employees e
      WHERE e.employee_id = auth_employee_id()
        AND e.role = 'hr'
    )
    OR (
      is_manager()
      AND (
        COALESCE(NULLIF(target_category, ''), 'General') = 'General'
        OR EXISTS (
          SELECT 1
          FROM public.employees scoped
          WHERE scoped.role = 'employee'
            AND scoped.position = COALESCE(NULLIF(target_category, ''), 'General')
            AND (
              scoped.manager_id = auth_employee_id()
              OR (
                scoped.department <> ''
                AND scoped.department = auth_department()
              )
            )
        )
      )
    )
  );
$$;

CREATE POLICY "Manage KPI definitions by category"
ON public.kpi_definitions FOR ALL TO authenticated
USING (can_manage_kpi_category(category))
WITH CHECK (can_manage_kpi_category(category));

CREATE POLICY "Manager manage competency config"
ON public.competency_config FOR ALL TO authenticated
USING (is_manager())
WITH CHECK (is_manager());

COMMIT;
