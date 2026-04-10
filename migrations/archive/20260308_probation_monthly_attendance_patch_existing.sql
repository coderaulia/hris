-- ==================================================
-- PATCH: Backfill probation monthly/attendance schema for existing tables
-- Date: 2026-03-08
-- Safe: additive only (no drop/delete)
-- ==================================================

BEGIN;

-- probation_monthly_scores: ensure required columns exist
DO $$
BEGIN
  IF to_regclass('public.probation_monthly_scores') IS NOT NULL THEN
    ALTER TABLE public.probation_monthly_scores
      ADD COLUMN IF NOT EXISTS manager_qualitative_text TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS manager_note TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS attendance_deduction NUMERIC NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS attitude_score NUMERIC NOT NULL DEFAULT 20,
      ADD COLUMN IF NOT EXISTS monthly_total NUMERIC NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

    UPDATE public.probation_monthly_scores
    SET
      manager_qualitative_text = COALESCE(manager_qualitative_text, ''),
      manager_note = COALESCE(manager_note, ''),
      attendance_deduction = COALESCE(attendance_deduction, 0),
      attitude_score = COALESCE(attitude_score, 20),
      monthly_total = COALESCE(monthly_total, 0)
    WHERE
      manager_qualitative_text IS NULL
      OR manager_note IS NULL
      OR attendance_deduction IS NULL
      OR attitude_score IS NULL
      OR monthly_total IS NULL;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.probation_monthly_scores'::regclass
        AND conname = 'probation_monthly_scores_review_month_key'
    ) THEN
      ALTER TABLE public.probation_monthly_scores
        ADD CONSTRAINT probation_monthly_scores_review_month_key
        UNIQUE (probation_review_id, month_no);
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.probation_monthly_scores'::regclass
        AND conname = 'probation_monthly_scores_month_no_check'
    ) THEN
      ALTER TABLE public.probation_monthly_scores
        ADD CONSTRAINT probation_monthly_scores_month_no_check
        CHECK (month_no BETWEEN 1 AND 3);
    END IF;
  END IF;
END $$;

-- probation_attendance_records: ensure required columns exist
DO $$
BEGIN
  IF to_regclass('public.probation_attendance_records') IS NOT NULL THEN
    ALTER TABLE public.probation_attendance_records
      ADD COLUMN IF NOT EXISTS event_date DATE,
      ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'attendance',
      ADD COLUMN IF NOT EXISTS qty NUMERIC NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS deduction_points NUMERIC NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS note TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS entered_by TEXT,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

    UPDATE public.probation_attendance_records
    SET
      event_type = COALESCE(event_type, 'attendance'),
      qty = COALESCE(qty, 1),
      deduction_points = COALESCE(deduction_points, 0),
      note = COALESCE(note, '')
    WHERE
      event_type IS NULL
      OR qty IS NULL
      OR deduction_points IS NULL
      OR note IS NULL;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.probation_attendance_records'::regclass
        AND conname = 'probation_attendance_records_month_no_check'
    ) THEN
      ALTER TABLE public.probation_attendance_records
        ADD CONSTRAINT probation_attendance_records_month_no_check
        CHECK (month_no BETWEEN 1 AND 3);
    END IF;
  END IF;
END $$;

-- Indexes only if table exists
DO $$
BEGIN
  IF to_regclass('public.probation_monthly_scores') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_probation_monthly_scores_review_month
      ON public.probation_monthly_scores(probation_review_id, month_no);
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.probation_attendance_records') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_probation_attendance_review_month
      ON public.probation_attendance_records(probation_review_id, month_no);
  END IF;
END $$;

ALTER TABLE IF EXISTS public.probation_monthly_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.probation_attendance_records ENABLE ROW LEVEL SECURITY;

-- Ensure baseline probation policies exist
DO $$ BEGIN
  IF to_regclass('public.probation_monthly_scores') IS NOT NULL
     AND to_regprocedure('public.can_access_employee(text)') IS NOT NULL
     AND NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='probation_monthly_scores' AND policyname='Read probation monthly scores by scope'
  ) THEN
    EXECUTE 'CREATE POLICY "Read probation monthly scores by scope" ON public.probation_monthly_scores FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.probation_reviews pr WHERE pr.id = probation_monthly_scores.probation_review_id AND can_access_employee(pr.employee_id)))';
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.probation_monthly_scores') IS NOT NULL
     AND to_regprocedure('public.can_access_employee(text)') IS NOT NULL
     AND NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='probation_monthly_scores' AND policyname='Manage probation monthly scores by scope'
  ) THEN
    EXECUTE 'CREATE POLICY "Manage probation monthly scores by scope" ON public.probation_monthly_scores FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.probation_reviews pr WHERE pr.id = probation_monthly_scores.probation_review_id AND can_access_employee(pr.employee_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.probation_reviews pr WHERE pr.id = probation_monthly_scores.probation_review_id AND can_access_employee(pr.employee_id)))';
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.probation_attendance_records') IS NOT NULL
     AND to_regprocedure('public.can_access_employee(text)') IS NOT NULL
     AND NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='probation_attendance_records' AND policyname='Read probation attendance by scope'
  ) THEN
    EXECUTE 'CREATE POLICY "Read probation attendance by scope" ON public.probation_attendance_records FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.probation_reviews pr WHERE pr.id = probation_attendance_records.probation_review_id AND can_access_employee(pr.employee_id)))';
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.probation_attendance_records') IS NOT NULL
     AND to_regprocedure('public.is_superadmin()') IS NOT NULL
     AND NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='probation_attendance_records' AND policyname='Superadmin manage probation attendance'
  ) THEN
    EXECUTE 'CREATE POLICY "Superadmin manage probation attendance" ON public.probation_attendance_records FOR ALL TO authenticated USING (is_superadmin()) WITH CHECK (is_superadmin())';
  END IF;
END $$;

-- Ensure HR operator helper and HR policies exist
CREATE OR REPLACE FUNCTION is_hr_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.employee_id = auth_employee_id()
      AND (
        e.role = 'hr'
        OR lower(coalesce(e.department, '')) = 'hr'
        OR lower(coalesce(e.department, '')) LIKE '%human resource%'
      )
  );
$$;

DO $$ BEGIN
  IF to_regclass('public.probation_monthly_scores') IS NOT NULL
     AND to_regprocedure('public.is_superadmin()') IS NOT NULL
     AND to_regprocedure('public.is_hr_user()') IS NOT NULL
     AND NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='probation_monthly_scores' AND policyname='HR manage probation monthly scores'
  ) THEN
    EXECUTE 'CREATE POLICY "HR manage probation monthly scores" ON public.probation_monthly_scores FOR ALL TO authenticated USING (is_superadmin() OR is_hr_user()) WITH CHECK (is_superadmin() OR is_hr_user())';
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.probation_attendance_records') IS NOT NULL
     AND to_regprocedure('public.is_superadmin()') IS NOT NULL
     AND to_regprocedure('public.is_hr_user()') IS NOT NULL
     AND NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='probation_attendance_records' AND policyname='HR manage probation attendance'
  ) THEN
    EXECUTE 'CREATE POLICY "HR manage probation attendance" ON public.probation_attendance_records FOR ALL TO authenticated USING (is_superadmin() OR is_hr_user()) WITH CHECK (is_superadmin() OR is_hr_user())';
  END IF;
END $$;

-- Triggers only if table exists
DO $$
BEGIN
  IF to_regclass('public.probation_monthly_scores') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS update_probation_monthly_scores_modtime ON public.probation_monthly_scores;
    CREATE TRIGGER update_probation_monthly_scores_modtime
    BEFORE UPDATE ON public.probation_monthly_scores
    FOR EACH ROW EXECUTE FUNCTION update_modified_column();
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.probation_attendance_records') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS update_probation_attendance_records_modtime ON public.probation_attendance_records;
    CREATE TRIGGER update_probation_attendance_records_modtime
    BEFORE UPDATE ON public.probation_attendance_records
    FOR EACH ROW EXECUTE FUNCTION update_modified_column();
  END IF;
END $$;

COMMIT;
