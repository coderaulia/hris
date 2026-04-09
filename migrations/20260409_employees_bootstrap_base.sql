BEGIN;

CREATE TABLE IF NOT EXISTS public.employees (
  employee_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  position TEXT DEFAULT '',
  seniority TEXT DEFAULT '',
  join_date DATE,
  department TEXT DEFAULT '',
  manager_id TEXT,
  auth_id UUID,
  role TEXT NOT NULL DEFAULT 'employee',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS auth_email TEXT;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS kpi_targets JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE;

COMMIT;
