-- ==================================================
-- Fresh Supabase bootstrap for HR Performance Suite
-- Step 1 of fresh-project setup
-- Purpose:
--   - enable required extension(s)
--   - create the base employees table expected by complete-setup.sql
-- Safe to re-run
-- ==================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.employees (
  employee_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  position TEXT NOT NULL DEFAULT '',
  seniority TEXT NOT NULL DEFAULT '',
  join_date DATE,
  department TEXT NOT NULL DEFAULT '',
  manager_id TEXT,
  auth_email TEXT,
  auth_id UUID,
  role TEXT NOT NULL DEFAULT 'employee',
  percentage NUMERIC NOT NULL DEFAULT 0,
  scores JSONB NOT NULL DEFAULT '[]'::jsonb,
  self_scores JSONB NOT NULL DEFAULT '[]'::jsonb,
  self_percentage NUMERIC NOT NULL DEFAULT 0,
  self_date TEXT DEFAULT '',
  history JSONB NOT NULL DEFAULT '[]'::jsonb,
  training_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  date_created TEXT DEFAULT '-',
  date_updated TEXT DEFAULT '-',
  date_next TEXT DEFAULT '-',
  tenure_display TEXT DEFAULT '',
  kpi_targets JSONB NOT NULL DEFAULT '{}'::jsonb,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  assessment_updated_by TEXT,
  assessment_updated_at TIMESTAMPTZ,
  self_assessment_updated_by TEXT,
  self_assessment_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT employees_role_check
    CHECK (role IN ('superadmin', 'director', 'manager', 'employee', 'hr')),
  CONSTRAINT employees_manager_id_fkey
    FOREIGN KEY (manager_id) REFERENCES public.employees(employee_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_employees_manager_id ON public.employees(manager_id);
CREATE INDEX IF NOT EXISTS idx_employees_role ON public.employees(role);
CREATE INDEX IF NOT EXISTS idx_employees_position ON public.employees(position);
