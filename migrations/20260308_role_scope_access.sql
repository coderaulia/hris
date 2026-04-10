-- ==================================================
-- Role scope and access extensions
-- Date: 2026-03-08
-- Replaces: director role scope + manager KPI/competency policy
-- Safe: additive / idempotent
-- ==================================================

BEGIN;


DO $$
BEGIN
  ALTER TABLE public.employees DROP CONSTRAINT IF EXISTS employees_role_check;
  ALTER TABLE public.employees
    ADD CONSTRAINT employees_role_check
    CHECK (role IN ('superadmin', 'director', 'manager', 'employee', 'hr'));
EXCEPTION WHEN others THEN
  NULL;
END $$;

CREATE OR REPLACE FUNCTION public.is_director()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.employee_id = auth_employee_id()
      AND e.role = 'director'
  );
$$;

CREATE OR REPLACE FUNCTION public.director_operational_scope_contains(target_employee_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employees target
    WHERE target.employee_id = target_employee_id
      AND target.employee_id <> auth_employee_id()
      AND EXISTS (
        SELECT 1
        FROM public.employees dr
        WHERE dr.manager_id = auth_employee_id()
          AND dr.position = target.position
      )
  );
$$;

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
    OR (
      is_director()
      AND director_operational_scope_contains(target_employee_id)
    )
  );
$$;

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_records ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'employees'
      AND policyname = 'Director read all employees'
  ) THEN
    EXECUTE 'CREATE POLICY "Director read all employees" ON public.employees FOR SELECT TO authenticated USING (is_director())';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'employees'
      AND policyname = 'Director update employees by operational scope'
  ) THEN
    EXECUTE 'CREATE POLICY "Director update employees by operational scope" ON public.employees FOR UPDATE TO authenticated USING (is_director() AND director_operational_scope_contains(employee_id)) WITH CHECK (is_director() AND director_operational_scope_contains(employee_id))';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'kpi_records'
      AND policyname = 'Director read all kpi records'
  ) THEN
    EXECUTE 'CREATE POLICY "Director read all kpi records" ON public.kpi_records FOR SELECT TO authenticated USING (is_director())';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'kpi_records'
      AND policyname = 'Director insert kpi records by operational scope'
  ) THEN
    EXECUTE 'CREATE POLICY "Director insert kpi records by operational scope" ON public.kpi_records FOR INSERT TO authenticated WITH CHECK (is_director() AND director_operational_scope_contains(employee_id))';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'kpi_records'
      AND policyname = 'Director update kpi records by operational scope'
  ) THEN
    EXECUTE 'CREATE POLICY "Director update kpi records by operational scope" ON public.kpi_records FOR UPDATE TO authenticated USING (is_director() AND director_operational_scope_contains(employee_id)) WITH CHECK (is_director() AND director_operational_scope_contains(employee_id))';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'kpi_records'
      AND policyname = 'Director delete kpi records by operational scope'
  ) THEN
    EXECUTE 'CREATE POLICY "Director delete kpi records by operational scope" ON public.kpi_records FOR DELETE TO authenticated USING (is_director() AND director_operational_scope_contains(employee_id))';
  END IF;
END $$;



ALTER TABLE competency_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_definitions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='competency_config' AND policyname='Manager manage competency config'
  ) THEN
    EXECUTE 'CREATE POLICY "Manager manage competency config" ON public.competency_config FOR ALL TO authenticated USING (is_manager()) WITH CHECK (is_manager())';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='kpi_definitions' AND policyname='Manager manage kpi definitions'
  ) THEN
    EXECUTE 'CREATE POLICY "Manager manage kpi definitions" ON public.kpi_definitions FOR ALL TO authenticated USING (is_manager()) WITH CHECK (is_manager())';
  END IF;
END $$;


COMMIT;
