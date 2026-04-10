-- ==================================================
-- HR Access Extension for Probation Workflow
-- Date: 2026-03-08
-- Safe: additive only
-- Purpose: allow HR operators + superadmin to manage probation attendance inputs and score recomputation
-- ==================================================

BEGIN;

CREATE OR REPLACE FUNCTION is_hr_user()
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
      AND (
        e.role = 'hr'
        OR lower(coalesce(e.department, '')) = 'hr'
        OR lower(coalesce(e.department, '')) LIKE '%human resource%'
        OR lower(coalesce(e.department, '')) LIKE '%human resources%'
      )
  );
$$;

DO $$
BEGIN
  IF to_regclass('public.probation_reviews') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.probation_reviews ENABLE ROW LEVEL SECURITY';

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'probation_reviews'
        AND policyname = 'HR manage probation reviews'
    ) THEN
      EXECUTE 'CREATE POLICY "HR manage probation reviews" ON public.probation_reviews FOR ALL TO authenticated USING (is_superadmin() OR is_hr_user()) WITH CHECK (is_superadmin() OR is_hr_user())';
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.probation_monthly_scores') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.probation_monthly_scores ENABLE ROW LEVEL SECURITY';

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'probation_monthly_scores'
        AND policyname = 'HR manage probation monthly scores'
    ) THEN
      EXECUTE 'CREATE POLICY "HR manage probation monthly scores" ON public.probation_monthly_scores FOR ALL TO authenticated USING (is_superadmin() OR is_hr_user()) WITH CHECK (is_superadmin() OR is_hr_user())';
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.probation_attendance_records') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.probation_attendance_records ENABLE ROW LEVEL SECURITY';

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'probation_attendance_records'
        AND policyname = 'HR manage probation attendance'
    ) THEN
      EXECUTE 'CREATE POLICY "HR manage probation attendance" ON public.probation_attendance_records FOR ALL TO authenticated USING (is_superadmin() OR is_hr_user()) WITH CHECK (is_superadmin() OR is_hr_user())';
    END IF;
  END IF;
END $$;

COMMIT;
