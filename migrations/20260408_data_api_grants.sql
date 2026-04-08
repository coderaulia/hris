-- ==================================================
-- Data API grant normalization
-- Date: 2026-04-08
-- Purpose:
-- - restore Supabase Data API access for anon/authenticated roles
-- - keep RLS as the access-control boundary
-- Safe: grants only
-- ==================================================

BEGIN;

GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT ON public.app_settings TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employees TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competency_config TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_definitions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_activity_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_assessments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_assessment_scores TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_assessment_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_training_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_performance_scores TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_weight_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_weight_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.probation_reviews TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.probation_qualitative_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.probation_monthly_scores TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.probation_attendance_records TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pip_plans TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pip_actions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_definition_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_kpi_target_versions TO authenticated;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

COMMIT;
