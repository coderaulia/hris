-- ==================================================
-- Rollback: Manpower Planning Foundation
-- Reverses: 20260409_manpower_planning.sql
-- Run as part of the rollback chain in reverse migration order.
-- ==================================================

BEGIN;

REVOKE SELECT ON public.recruitment_pipeline_overview FROM authenticated;
REVOKE SELECT ON public.headcount_request_overview FROM authenticated;
REVOKE SELECT ON public.manpower_plan_overview FROM authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.recruitment_pipeline FROM authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.headcount_requests FROM authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.manpower_plans FROM authenticated;

DROP VIEW IF EXISTS public.recruitment_pipeline_overview;
DROP VIEW IF EXISTS public.headcount_request_overview;
DROP VIEW IF EXISTS public.manpower_plan_overview;

DROP TRIGGER IF EXISTS update_recruitment_pipeline_modtime ON public.recruitment_pipeline;
DROP TRIGGER IF EXISTS update_headcount_requests_modtime ON public.headcount_requests;
DROP TRIGGER IF EXISTS update_manpower_plans_modtime ON public.manpower_plans;

DROP POLICY IF EXISTS "Manage recruitment pipeline" ON public.recruitment_pipeline;
DROP POLICY IF EXISTS "Read recruitment pipeline by scope" ON public.recruitment_pipeline;
DROP POLICY IF EXISTS "Review headcount requests" ON public.headcount_requests;
DROP POLICY IF EXISTS "Manage own pending headcount requests" ON public.headcount_requests;
DROP POLICY IF EXISTS "Create headcount requests by department scope" ON public.headcount_requests;
DROP POLICY IF EXISTS "Manage headcount requests" ON public.headcount_requests;
DROP POLICY IF EXISTS "Read headcount requests by scope" ON public.headcount_requests;
DROP POLICY IF EXISTS "Manage manpower plans" ON public.manpower_plans;
DROP POLICY IF EXISTS "Read manpower plans by scope" ON public.manpower_plans;

DROP TABLE IF EXISTS public.recruitment_pipeline;
DROP TABLE IF EXISTS public.headcount_requests;
DROP TABLE IF EXISTS public.manpower_plans;

DROP FUNCTION IF EXISTS public.can_review_headcount_request();
DROP FUNCTION IF EXISTS public.can_submit_headcount_request(TEXT);

COMMIT;
