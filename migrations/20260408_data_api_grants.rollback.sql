-- ==================================================
-- Rollback: Data API Grant Normalization
-- Reverses: 20260408_data_api_grants.sql
-- Run as part of the rollback chain in reverse migration order.
-- ==================================================

BEGIN;

REVOKE USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public FROM authenticated;

REVOKE SELECT, INSERT, UPDATE, DELETE ON public.employee_kpi_target_versions FROM authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.kpi_definition_versions FROM authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.pip_actions FROM authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.pip_plans FROM authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.probation_attendance_records FROM authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.probation_monthly_scores FROM authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.probation_qualitative_items FROM authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.probation_reviews FROM authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.kpi_weight_items FROM authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.kpi_weight_profiles FROM authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.employee_performance_scores FROM authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.employee_training_records FROM authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.employee_assessment_history FROM authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.employee_assessment_scores FROM authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.employee_assessments FROM authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.admin_activity_log FROM authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.kpi_records FROM authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.kpi_definitions FROM authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.competency_config FROM authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.employees FROM authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.app_settings FROM authenticated;

REVOKE SELECT ON public.app_settings FROM anon;
REVOKE USAGE ON SCHEMA public FROM anon, authenticated;

COMMIT;
