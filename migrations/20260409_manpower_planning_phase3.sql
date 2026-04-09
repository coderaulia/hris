-- ==================================================
-- Manpower planning phase 3A recruitment board
-- Date: 2026-04-09
-- Safe: additive / idempotent
-- ==================================================

BEGIN;

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
