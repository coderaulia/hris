-- ==================================================
-- Rollback: KPI Governance
-- Reverses: 20260308_kpi_governance.sql
-- Run as part of the rollback chain in reverse migration order.
-- ==================================================

BEGIN;

DROP TRIGGER IF EXISTS update_employee_kpi_target_versions_modtime ON public.employee_kpi_target_versions;
DROP TRIGGER IF EXISTS update_kpi_definition_versions_modtime ON public.kpi_definition_versions;

DROP POLICY IF EXISTS "Delete employee KPI target versions (superadmin)" ON public.employee_kpi_target_versions;
DROP POLICY IF EXISTS "Update employee KPI target versions by scope" ON public.employee_kpi_target_versions;
DROP POLICY IF EXISTS "Insert employee KPI target versions by scope" ON public.employee_kpi_target_versions;
DROP POLICY IF EXISTS "Read employee KPI target versions by scope" ON public.employee_kpi_target_versions;
DROP POLICY IF EXISTS "Delete KPI definition versions (superadmin)" ON public.kpi_definition_versions;
DROP POLICY IF EXISTS "Update KPI definition versions (approver)" ON public.kpi_definition_versions;
DROP POLICY IF EXISTS "Manage KPI definition versions (manager submit)" ON public.kpi_definition_versions;
DROP POLICY IF EXISTS "Read KPI definition versions" ON public.kpi_definition_versions;
DROP POLICY IF EXISTS "Manage KPI definitions by category" ON public.kpi_definitions;
DROP POLICY IF EXISTS "Read KPI definitions" ON public.kpi_definitions;

ALTER TABLE public.kpi_records
  DROP CONSTRAINT IF EXISTS kpi_records_target_version_id_fkey,
  DROP CONSTRAINT IF EXISTS kpi_records_definition_version_id_fkey,
  DROP COLUMN IF EXISTS target_version_id,
  DROP COLUMN IF EXISTS definition_version_id,
  DROP COLUMN IF EXISTS kpi_category_snapshot,
  DROP COLUMN IF EXISTS kpi_unit_snapshot,
  DROP COLUMN IF EXISTS kpi_name_snapshot,
  DROP COLUMN IF EXISTS target_snapshot;

DROP TABLE IF EXISTS public.employee_kpi_target_versions;
DROP TABLE IF EXISTS public.kpi_definition_versions;

ALTER TABLE public.kpi_definitions
  DROP CONSTRAINT IF EXISTS kpi_definitions_effective_period_check,
  DROP CONSTRAINT IF EXISTS kpi_definitions_approval_status_check,
  DROP COLUMN IF EXISTS approved_at,
  DROP COLUMN IF EXISTS approved_by,
  DROP COLUMN IF EXISTS latest_version_no,
  DROP COLUMN IF EXISTS is_active,
  DROP COLUMN IF EXISTS approval_required,
  DROP COLUMN IF EXISTS approval_status,
  DROP COLUMN IF EXISTS effective_period;

DROP FUNCTION IF EXISTS public.can_manage_kpi_category(TEXT);

DELETE FROM public.app_settings
WHERE key = 'kpi_hr_approval_required';

COMMIT;
