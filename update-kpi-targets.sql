-- Run this script in your Supabase SQL Editor to add the individualized KPI targets column

DO $$ BEGIN
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS kpi_targets JSONB DEFAULT '{}'::jsonb;
EXCEPTION WHEN others THEN NULL;
END $$;
