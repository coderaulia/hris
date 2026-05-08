-- ==================================================
-- Rollback: Dashboard Server-Side Summary and Operational Views
-- Reverses: 20260409_dashboard_server_views.sql
-- Run as part of the rollback chain in reverse migration order.
-- ==================================================

BEGIN;

REVOKE SELECT ON public.dashboard_assessment_coverage FROM authenticated;
REVOKE SELECT ON public.dashboard_probation_expiry FROM authenticated;
REVOKE SELECT ON public.dashboard_summary FROM authenticated;

DROP VIEW IF EXISTS public.dashboard_assessment_coverage;
DROP VIEW IF EXISTS public.dashboard_probation_expiry;
DROP VIEW IF EXISTS public.dashboard_summary;

DROP INDEX IF EXISTS public.idx_employee_assessments_employee_type_recent;
DROP INDEX IF EXISTS public.idx_probation_reviews_end_date_scope;

DROP FUNCTION IF EXISTS public.dashboard_open_hires_count();
DROP FUNCTION IF EXISTS public.dashboard_failed_notifications_count();
DROP FUNCTION IF EXISTS public.dashboard_scope_employee(TEXT);

COMMIT;
