-- ==================================================
-- Manpower planning foundation
-- Date: 2026-04-09
-- Replaces: manpower planning phases 1, 2, and 3A
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



CREATE OR REPLACE FUNCTION public.can_submit_headcount_request(target_department TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    is_superadmin()
    OR is_hr_user()
    OR (is_manager() AND COALESCE(NULLIF(target_department, ''), '') = COALESCE(auth_department(), ''))
  );
$$;

CREATE OR REPLACE FUNCTION public.can_review_headcount_request()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    is_superadmin()
    OR is_hr_user()
  );
$$;

ALTER TABLE public.headcount_requests
  ADD COLUMN IF NOT EXISTS approval_note TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_headcount_requests_requested_by
  ON public.headcount_requests(requested_by, approval_status, created_at DESC);

DO $$
BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Read headcount requests by scope" ON public.headcount_requests';
  EXECUTE 'DROP POLICY IF EXISTS "Manage headcount requests" ON public.headcount_requests';
  EXECUTE 'DROP POLICY IF EXISTS "Create headcount requests by department scope" ON public.headcount_requests';
  EXECUTE 'DROP POLICY IF EXISTS "Manage own pending headcount requests" ON public.headcount_requests';
  EXECUTE 'DROP POLICY IF EXISTS "Review headcount requests" ON public.headcount_requests';

  EXECUTE 'CREATE POLICY "Read headcount requests by scope" ON public.headcount_requests FOR SELECT TO authenticated USING (
    is_superadmin()
    OR is_hr_user()
    OR is_director()
    OR requested_by = auth_employee_id()
    OR (is_manager() AND department = auth_department())
  )';

  EXECUTE 'CREATE POLICY "Create headcount requests by department scope" ON public.headcount_requests FOR INSERT TO authenticated WITH CHECK (
    can_submit_headcount_request(department)
    AND requested_by = auth_employee_id()
    AND approval_status = ''pending''
    AND approved_by IS NULL
  )';

  EXECUTE 'CREATE POLICY "Manage own pending headcount requests" ON public.headcount_requests FOR UPDATE TO authenticated USING (
    requested_by = auth_employee_id()
    AND approval_status IN (''pending'', ''cancelled'')
  ) WITH CHECK (
    requested_by = auth_employee_id()
    AND approval_status IN (''pending'', ''cancelled'')
    AND approved_by IS NULL
    AND can_submit_headcount_request(department)
  )';

  EXECUTE 'CREATE POLICY "Review headcount requests" ON public.headcount_requests FOR UPDATE TO authenticated USING (
    can_review_headcount_request()
  ) WITH CHECK (
    can_review_headcount_request()
  )';
END $$;

CREATE OR REPLACE VIEW public.headcount_request_overview
WITH (security_invoker = true)
AS
WITH pipeline_counts AS (
  SELECT
    rp.request_id,
    COUNT(*)::INTEGER AS pipeline_total,
    COUNT(*) FILTER (WHERE rp.stage = 'hired')::INTEGER AS hired_total,
    COUNT(*) FILTER (WHERE rp.stage IN ('sourcing', 'screening', 'interview', 'offer'))::INTEGER AS active_pipeline_total
  FROM public.recruitment_pipeline rp
  GROUP BY rp.request_id
)
SELECT
  hr.id,
  hr.plan_id,
  hr.request_code,
  hr.department,
  hr.position,
  hr.seniority,
  hr.requested_count,
  hr.business_reason,
  hr.priority,
  hr.requested_by,
  requester.name AS requested_by_name,
  hr.approved_by,
  approver.name AS approved_by_name,
  hr.approval_status,
  hr.approval_note,
  hr.target_hire_date,
  hr.created_at,
  hr.updated_at,
  mp.period AS plan_period,
  mp.status AS plan_status,
  COALESCE(pc.pipeline_total, 0) AS pipeline_total,
  COALESCE(pc.active_pipeline_total, 0) AS active_pipeline_total,
  COALESCE(pc.hired_total, 0) AS hired_total
FROM public.headcount_requests hr
LEFT JOIN public.manpower_plans mp
  ON mp.id = hr.plan_id
LEFT JOIN public.employees requester
  ON requester.employee_id = hr.requested_by
LEFT JOIN public.employees approver
  ON approver.employee_id = hr.approved_by
LEFT JOIN pipeline_counts pc
  ON pc.request_id = hr.id;

GRANT SELECT ON public.headcount_request_overview TO authenticated;



ALTER TABLE public.recruitment_pipeline
  ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_recruitment_pipeline_request_stage_recent
  ON public.recruitment_pipeline(request_id, stage, stage_updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_recruitment_pipeline_owner_recent
  ON public.recruitment_pipeline(owner_id, stage_updated_at DESC);

CREATE OR REPLACE VIEW public.recruitment_pipeline_overview
WITH (security_invoker = true)
AS
WITH request_progress AS (
  SELECT
    hr.id AS request_id,
    GREATEST(hr.requested_count - COALESCE(pc.hired_total, 0), 0) AS remaining_openings
  FROM public.headcount_requests hr
  LEFT JOIN (
    SELECT
      rp.request_id,
      COUNT(*) FILTER (WHERE lower(coalesce(rp.stage, '')) = 'hired')::INTEGER AS hired_total
    FROM public.recruitment_pipeline rp
    GROUP BY rp.request_id
  ) pc
    ON pc.request_id = hr.id
)
SELECT
  rp.id,
  rp.request_id,
  rp.candidate_name,
  rp.stage,
  rp.source,
  rp.owner_id,
  owner.name AS owner_name,
  rp.stage_updated_at,
  rp.offer_status,
  rp.expected_start_date,
  rp.notes,
  rp.created_at,
  rp.updated_at,
  hr.request_code,
  hr.department,
  hr.position,
  hr.seniority,
  hr.priority,
  hr.approval_status,
  hr.target_hire_date,
  hr.requested_count,
  hr.business_reason,
  hr.requested_by,
  requester.name AS requested_by_name,
  hr.approved_by,
  approver.name AS approved_by_name,
  mp.period AS plan_period,
  COALESCE(rprog.remaining_openings, hr.requested_count)::INTEGER AS remaining_openings,
  GREATEST((CURRENT_DATE - COALESCE(hr.target_hire_date, CURRENT_DATE))::INTEGER, 0) AS overdue_days,
  GREATEST((CURRENT_DATE - COALESCE(rp.stage_updated_at::date, CURRENT_DATE))::INTEGER, 0) AS stage_age_days
FROM public.recruitment_pipeline rp
JOIN public.headcount_requests hr
  ON hr.id = rp.request_id
LEFT JOIN public.manpower_plans mp
  ON mp.id = hr.plan_id
LEFT JOIN public.employees owner
  ON owner.employee_id = rp.owner_id
LEFT JOIN public.employees requester
  ON requester.employee_id = hr.requested_by
LEFT JOIN public.employees approver
  ON approver.employee_id = hr.approved_by
LEFT JOIN request_progress rprog
  ON rprog.request_id = hr.id;

GRANT SELECT ON public.recruitment_pipeline_overview TO authenticated;


COMMIT;
