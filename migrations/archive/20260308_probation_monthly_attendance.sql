-- ==================================================
-- Probation Monthly Scoring + Attendance Entries
-- Date: 2026-03-08
-- Safe: additive only
-- ==================================================

BEGIN;

CREATE TABLE IF NOT EXISTS probation_monthly_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  probation_review_id UUID NOT NULL REFERENCES probation_reviews(id) ON DELETE CASCADE,
  month_no INT NOT NULL CHECK (month_no BETWEEN 1 AND 3),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  work_performance_score NUMERIC NOT NULL DEFAULT 0,
  managing_task_score NUMERIC NOT NULL DEFAULT 0,
  manager_qualitative_text TEXT DEFAULT '',
  manager_note TEXT DEFAULT '',
  attendance_deduction NUMERIC NOT NULL DEFAULT 0,
  attitude_score NUMERIC NOT NULL DEFAULT 20,
  monthly_total NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (probation_review_id, month_no)
);

CREATE TABLE IF NOT EXISTS probation_attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  probation_review_id UUID NOT NULL REFERENCES probation_reviews(id) ON DELETE CASCADE,
  month_no INT NOT NULL CHECK (month_no BETWEEN 1 AND 3),
  event_date DATE,
  event_type TEXT NOT NULL DEFAULT 'attendance',
  qty NUMERIC NOT NULL DEFAULT 1,
  deduction_points NUMERIC NOT NULL DEFAULT 0,
  note TEXT DEFAULT '',
  entered_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_probation_monthly_scores_review_month
  ON probation_monthly_scores(probation_review_id, month_no);

CREATE INDEX IF NOT EXISTS idx_probation_attendance_review_month
  ON probation_attendance_records(probation_review_id, month_no);

ALTER TABLE probation_monthly_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE probation_attendance_records ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='probation_monthly_scores' AND policyname='Read probation monthly scores by scope'
  ) THEN
    EXECUTE 'CREATE POLICY "Read probation monthly scores by scope" ON public.probation_monthly_scores FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.probation_reviews pr WHERE pr.id = probation_monthly_scores.probation_review_id AND can_access_employee(pr.employee_id)))';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='probation_monthly_scores' AND policyname='Manage probation monthly scores by scope'
  ) THEN
    EXECUTE 'CREATE POLICY "Manage probation monthly scores by scope" ON public.probation_monthly_scores FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.probation_reviews pr WHERE pr.id = probation_monthly_scores.probation_review_id AND can_access_employee(pr.employee_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.probation_reviews pr WHERE pr.id = probation_monthly_scores.probation_review_id AND can_access_employee(pr.employee_id)))';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='probation_attendance_records' AND policyname='Read probation attendance by scope'
  ) THEN
    EXECUTE 'CREATE POLICY "Read probation attendance by scope" ON public.probation_attendance_records FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.probation_reviews pr WHERE pr.id = probation_attendance_records.probation_review_id AND can_access_employee(pr.employee_id)))';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='probation_attendance_records' AND policyname='Superadmin manage probation attendance'
  ) THEN
    EXECUTE 'CREATE POLICY "Superadmin manage probation attendance" ON public.probation_attendance_records FOR ALL TO authenticated USING (is_superadmin()) WITH CHECK (is_superadmin())';
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_probation_monthly_scores_modtime ON probation_monthly_scores;
CREATE TRIGGER update_probation_monthly_scores_modtime
BEFORE UPDATE ON probation_monthly_scores
FOR EACH ROW EXECUTE FUNCTION update_modified_column();

DROP TRIGGER IF EXISTS update_probation_attendance_records_modtime ON probation_attendance_records;
CREATE TRIGGER update_probation_attendance_records_modtime
BEFORE UPDATE ON probation_attendance_records
FOR EACH ROW EXECUTE FUNCTION update_modified_column();

COMMIT;