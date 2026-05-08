-- ==================================================
-- Rollback: Legacy Employee Assessment Columns
-- Reverses: 20260409_drop_legacy_employee_assessment_columns.sql
-- Note: recreates the legacy columns only; normalized data is not copied back.
-- ==================================================

BEGIN;

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS percentage NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scores JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS self_scores JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS self_percentage NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS self_date TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS history JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS training_history JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS date_created TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS date_updated TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS date_next TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS assessment_updated_by TEXT,
  ADD COLUMN IF NOT EXISTS assessment_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS self_assessment_updated_by TEXT,
  ADD COLUMN IF NOT EXISTS self_assessment_updated_at TIMESTAMPTZ;

COMMIT;
