-- ==================================================
-- Manpower planning phase 2 request workflow
-- Date: 2026-04-09
-- Safe: additive / idempotent
-- ==================================================

BEGIN;

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

COMMIT;
