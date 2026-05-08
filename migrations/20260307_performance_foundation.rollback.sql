-- ==================================================
-- Rollback: normalized assessment/training + scoring, probation, PIP
-- Reverses: 20260307_performance_foundation.sql
-- Run as part of the rollback chain in reverse migration order.
-- ==================================================

BEGIN;

DROP TRIGGER IF EXISTS update_pip_actions_modtime ON public.pip_actions;
DROP TRIGGER IF EXISTS update_pip_plans_modtime ON public.pip_plans;
DROP TRIGGER IF EXISTS update_probation_qualitative_items_modtime ON public.probation_qualitative_items;
DROP TRIGGER IF EXISTS update_probation_reviews_modtime ON public.probation_reviews;
DROP TRIGGER IF EXISTS update_kpi_weight_items_modtime ON public.kpi_weight_items;
DROP TRIGGER IF EXISTS update_kpi_weight_profiles_modtime ON public.kpi_weight_profiles;
DROP TRIGGER IF EXISTS update_employee_performance_scores_modtime ON public.employee_performance_scores;
DROP TRIGGER IF EXISTS update_employee_training_records_modtime ON public.employee_training_records;
DROP TRIGGER IF EXISTS update_employee_assessment_scores_modtime ON public.employee_assessment_scores;
DROP TRIGGER IF EXISTS update_employee_assessments_modtime ON public.employee_assessments;

DROP POLICY IF EXISTS "Access PIP actions by scope" ON public.pip_actions;
DROP POLICY IF EXISTS "Access PIP plans by scope" ON public.pip_plans;
DROP POLICY IF EXISTS "Access probation qualitative items by scope" ON public.probation_qualitative_items;
DROP POLICY IF EXISTS "Access probation reviews by scope" ON public.probation_reviews;
DROP POLICY IF EXISTS "Superadmin manage KPI weight items" ON public.kpi_weight_items;
DROP POLICY IF EXISTS "Read KPI weight items" ON public.kpi_weight_items;
DROP POLICY IF EXISTS "Superadmin manage KPI weight profiles" ON public.kpi_weight_profiles;
DROP POLICY IF EXISTS "Read KPI weight profiles" ON public.kpi_weight_profiles;
DROP POLICY IF EXISTS "Access employee performance scores by scope" ON public.employee_performance_scores;
DROP POLICY IF EXISTS "Access employee training records by scope" ON public.employee_training_records;
DROP POLICY IF EXISTS "Access employee assessment history by scope" ON public.employee_assessment_history;
DROP POLICY IF EXISTS "Access employee assessment scores by scope" ON public.employee_assessment_scores;
DROP POLICY IF EXISTS "Access employee assessments by scope" ON public.employee_assessments;

DROP TABLE IF EXISTS public.pip_actions;
DROP TABLE IF EXISTS public.pip_plans;
DROP TABLE IF EXISTS public.probation_qualitative_items;
DROP TABLE IF EXISTS public.probation_reviews;
DROP TABLE IF EXISTS public.kpi_weight_items;
DROP TABLE IF EXISTS public.kpi_weight_profiles;
DROP TABLE IF EXISTS public.employee_performance_scores;
DROP TABLE IF EXISTS public.employee_training_records;
DROP TABLE IF EXISTS public.employee_assessment_history;
DROP TABLE IF EXISTS public.employee_assessment_scores;
DROP TABLE IF EXISTS public.employee_assessments;

DROP FUNCTION IF EXISTS public.can_access_employee(TEXT);

COMMIT;
