-- ==================================================
-- Manpower planning phase 1 foundation
-- Date: 2026-04-09
-- Safe: additive / idempotent
-- ==================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.manpower_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period TEXT NOT NULL CHECK (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  department TEXT NOT NULL DEFAULT '',
  position TEXT NOT NULL DEFAULT '',
  seniority TEXT NOT NULL DEFAULT '',
  planned_headcount INTEGER NOT NULL DEFAULT 0 CHECK (planned_headcount >= 0),
  approved_headcount INTEGER NOT NULL DEFAULT 0 CHECK (approved_headcount >= 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'active', 'closed')),
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (period, department, position, seniority)
);

CREATE TABLE IF NOT EXISTS public.headcount_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID REFERENCES public.manpower_plans(id) ON DELETE SET NULL,
  request_code TEXT NOT NULL DEFAULT '',
  department TEXT NOT NULL DEFAULT '',
  position TEXT NOT NULL DEFAULT '',
  seniority TEXT NOT NULL DEFAULT '',
  requested_count INTEGER NOT NULL DEFAULT 1 CHECK (requested_count > 0),
  business_reason TEXT NOT NULL DEFAULT '',
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  requested_by TEXT,
  approved_by TEXT,
  approval_status TEXT NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected', 'cancelled')),
  target_hire_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.recruitment_pipeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.headcount_requests(id) ON DELETE CASCADE,
  candidate_name TEXT,
  stage TEXT NOT NULL DEFAULT 'requested' CHECK (stage IN ('requested', 'sourcing', 'screening', 'interview', 'offer', 'hired', 'closed')),
  source TEXT NOT NULL DEFAULT '',
  owner_id TEXT,
  stage_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  offer_status TEXT,
  expected_start_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_manpower_plans_period_department
  ON public.manpower_plans(period, department, position, seniority);

CREATE INDEX IF NOT EXISTS idx_headcount_requests_plan_status
  ON public.headcount_requests(plan_id, approval_status, target_hire_date);

CREATE INDEX IF NOT EXISTS idx_recruitment_pipeline_request_stage
  ON public.recruitment_pipeline(request_id, stage, stage_updated_at DESC);

ALTER TABLE public.manpower_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.headcount_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recruitment_pipeline ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'manpower_plans' AND policyname = 'Read manpower plans by scope'
  ) THEN
    EXECUTE 'CREATE POLICY "Read manpower plans by scope" ON public.manpower_plans FOR SELECT TO authenticated USING (is_superadmin() OR is_hr_user() OR (is_manager() AND department = auth_department()) OR is_director())';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'manpower_plans' AND policyname = 'Manage manpower plans'
  ) THEN
    EXECUTE 'CREATE POLICY "Manage manpower plans" ON public.manpower_plans FOR ALL TO authenticated USING (is_superadmin() OR is_hr_user()) WITH CHECK (is_superadmin() OR is_hr_user())';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'headcount_requests' AND policyname = 'Read headcount requests by scope'
  ) THEN
    EXECUTE 'CREATE POLICY "Read headcount requests by scope" ON public.headcount_requests FOR SELECT TO authenticated USING (is_superadmin() OR is_hr_user() OR (is_manager() AND department = auth_department()) OR is_director())';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'headcount_requests' AND policyname = 'Manage headcount requests'
  ) THEN
    EXECUTE 'CREATE POLICY "Manage headcount requests" ON public.headcount_requests FOR ALL TO authenticated USING (is_superadmin() OR is_hr_user()) WITH CHECK (is_superadmin() OR is_hr_user())';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'recruitment_pipeline' AND policyname = 'Read recruitment pipeline by scope'
  ) THEN
    EXECUTE 'CREATE POLICY "Read recruitment pipeline by scope" ON public.recruitment_pipeline FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.headcount_requests hr WHERE hr.id = recruitment_pipeline.request_id AND (is_superadmin() OR is_hr_user() OR (is_manager() AND hr.department = auth_department()) OR is_director())))';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'recruitment_pipeline' AND policyname = 'Manage recruitment pipeline'
  ) THEN
    EXECUTE 'CREATE POLICY "Manage recruitment pipeline" ON public.recruitment_pipeline FOR ALL TO authenticated USING (is_superadmin() OR is_hr_user()) WITH CHECK (is_superadmin() OR is_hr_user())';
  END IF;
END $$;

CREATE OR REPLACE VIEW public.manpower_plan_overview
WITH (security_invoker = true)
AS
WITH current_headcount AS (
  SELECT
    COALESCE(NULLIF(e.department, ''), 'Unassigned') AS department,
    COALESCE(NULLIF(e.position, ''), '-') AS position,
    COALESCE(NULLIF(e.seniority, ''), '') AS seniority,
    COUNT(*)::INTEGER AS filled_headcount
  FROM public.employees e
  WHERE e.role = 'employee'
  GROUP BY 1, 2, 3
)
SELECT
  mp.id,
  mp.period,
  mp.department,
  mp.position,
  mp.seniority,
  mp.planned_headcount,
  mp.approved_headcount,
  COALESCE(ch.filled_headcount, 0) AS filled_headcount,
  GREATEST(mp.approved_headcount - COALESCE(ch.filled_headcount, 0), 0) AS gap_headcount,
  mp.status,
  mp.notes,
  mp.created_by,
  mp.updated_by,
  mp.created_at,
  mp.updated_at
FROM public.manpower_plans mp
LEFT JOIN current_headcount ch
  ON ch.department = COALESCE(NULLIF(mp.department, ''), 'Unassigned')
 AND ch.position = COALESCE(NULLIF(mp.position, ''), '-')
 AND ch.seniority = COALESCE(NULLIF(mp.seniority, ''), '');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.manpower_plans TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.headcount_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recruitment_pipeline TO authenticated;
GRANT SELECT ON public.manpower_plan_overview TO authenticated;

DROP TRIGGER IF EXISTS update_manpower_plans_modtime ON public.manpower_plans;
CREATE TRIGGER update_manpower_plans_modtime
BEFORE UPDATE ON public.manpower_plans
FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();

DROP TRIGGER IF EXISTS update_headcount_requests_modtime ON public.headcount_requests;
CREATE TRIGGER update_headcount_requests_modtime
BEFORE UPDATE ON public.headcount_requests
FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();

DROP TRIGGER IF EXISTS update_recruitment_pipeline_modtime ON public.recruitment_pipeline;
CREATE TRIGGER update_recruitment_pipeline_modtime
BEFORE UPDATE ON public.recruitment_pipeline
FOR EACH ROW EXECUTE FUNCTION public.update_modified_column();

COMMIT;
