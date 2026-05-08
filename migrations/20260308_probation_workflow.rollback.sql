-- ==================================================
-- Rollback: Probation Workflow Foundation
-- Reverses: 20260308_probation_workflow.sql
-- Run as part of the rollback chain in reverse migration order.
-- ==================================================

BEGIN;

DROP POLICY IF EXISTS "HR manage probation attendance" ON public.probation_attendance_records;
DROP POLICY IF EXISTS "HR manage probation monthly scores" ON public.probation_monthly_scores;
DROP POLICY IF EXISTS "HR manage probation reviews" ON public.probation_reviews;
DROP POLICY IF EXISTS "Superadmin manage probation attendance" ON public.probation_attendance_records;
DROP POLICY IF EXISTS "Read probation attendance by scope" ON public.probation_attendance_records;
DROP POLICY IF EXISTS "Manage probation monthly scores by scope" ON public.probation_monthly_scores;
DROP POLICY IF EXISTS "Read probation monthly scores by scope" ON public.probation_monthly_scores;

DROP TRIGGER IF EXISTS update_probation_attendance_records_modtime ON public.probation_attendance_records;
DROP TRIGGER IF EXISTS update_probation_monthly_scores_modtime ON public.probation_monthly_scores;

DROP TABLE IF EXISTS public.probation_attendance_records;
DROP TABLE IF EXISTS public.probation_monthly_scores;

DROP FUNCTION IF EXISTS public.is_hr_user();

COMMIT;
