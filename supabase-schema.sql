-- ==================================================
-- WEI HR Performance Suite — Supabase Migration
-- Safe to re-run (handles existing objects)
-- ==================================================

-- 0. APP SETTINGS TABLE
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO app_settings (key, value) VALUES
  ('app_name', 'HR Performance Suite'),
  ('company_name', 'Warna Emas Indonesia'),
  ('company_short', 'WEI'),
  ('department_label', 'Human Resources Department'),
  ('logo_url', ''),
  ('primary_color', '#4f46e5'),
  ('assessment_scale_max', '10'),
  ('assessment_threshold', '7')
ON CONFLICT (key) DO NOTHING;

-- 1. EMPLOYEES TABLE — add missing columns if needed
DO $$ BEGIN
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS auth_email TEXT;
EXCEPTION WHEN others THEN NULL;
END $$;

-- Update role constraint to allow superadmin
DO $$ BEGIN
  ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_role_check;
  ALTER TABLE employees ADD CONSTRAINT employees_role_check 
    CHECK (role IN ('superadmin', 'manager', 'employee'));
EXCEPTION WHEN others THEN NULL;
END $$;

-- 2. ENSURE ALL TABLES EXIST
CREATE TABLE IF NOT EXISTS competency_config (
  position_name TEXT PRIMARY KEY,
  competencies JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kpi_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  category TEXT DEFAULT 'General',
  target NUMERIC DEFAULT 0,
  unit TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kpi_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id TEXT NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
  kpi_id UUID NOT NULL REFERENCES kpi_definitions(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  value NUMERIC NOT NULL DEFAULT 0,
  notes TEXT DEFAULT '',
  submitted_by TEXT,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. RLS — DROP existing policies first, then recreate
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE competency_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_records ENABLE ROW LEVEL SECURITY;

-- App Settings
DROP POLICY IF EXISTS "Allow read settings" ON app_settings;
DROP POLICY IF EXISTS "Allow write settings" ON app_settings;
CREATE POLICY "Allow read settings" ON app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow write settings" ON app_settings FOR ALL TO authenticated USING (true);

-- Employees
DROP POLICY IF EXISTS "Allow read for authenticated users" ON employees;
DROP POLICY IF EXISTS "Allow insert for authenticated users" ON employees;
DROP POLICY IF EXISTS "Allow update for authenticated users" ON employees;
DROP POLICY IF EXISTS "Allow delete for authenticated users" ON employees;
DROP POLICY IF EXISTS "Allow read employees" ON employees;
DROP POLICY IF EXISTS "Allow insert employees" ON employees;
DROP POLICY IF EXISTS "Allow update employees" ON employees;
DROP POLICY IF EXISTS "Allow delete employees" ON employees;
CREATE POLICY "Allow read employees" ON employees FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow insert employees" ON employees FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow update employees" ON employees FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Allow delete employees" ON employees FOR DELETE TO authenticated USING (true);

-- Config
DROP POLICY IF EXISTS "Allow read config" ON competency_config;
DROP POLICY IF EXISTS "Allow write config" ON competency_config;
CREATE POLICY "Allow read config" ON competency_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow write config" ON competency_config FOR ALL TO authenticated USING (true);

-- KPI Definitions
DROP POLICY IF EXISTS "Allow read kpi defs" ON kpi_definitions;
DROP POLICY IF EXISTS "Allow write kpi defs" ON kpi_definitions;
CREATE POLICY "Allow read kpi defs" ON kpi_definitions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow write kpi defs" ON kpi_definitions FOR ALL TO authenticated USING (true);

-- KPI Records
DROP POLICY IF EXISTS "Allow read kpi records" ON kpi_records;
DROP POLICY IF EXISTS "Allow write kpi records" ON kpi_records;
CREATE POLICY "Allow read kpi records" ON kpi_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow write kpi records" ON kpi_records FOR ALL TO authenticated USING (true);

-- 4. INDEXES
CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department);
CREATE INDEX IF NOT EXISTS idx_employees_auth_id ON employees(auth_id);
CREATE INDEX IF NOT EXISTS idx_employees_auth_email ON employees(auth_email);
CREATE INDEX IF NOT EXISTS idx_kpi_records_employee ON kpi_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_kpi_records_period ON kpi_records(period);
CREATE INDEX IF NOT EXISTS idx_kpi_records_kpi_id ON kpi_records(kpi_id);

-- 5. TRIGGERS
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_employees_modtime ON employees;
CREATE TRIGGER update_employees_modtime BEFORE UPDATE ON employees FOR EACH ROW EXECUTE FUNCTION update_modified_column();

DROP TRIGGER IF EXISTS update_config_modtime ON competency_config;
CREATE TRIGGER update_config_modtime BEFORE UPDATE ON competency_config FOR EACH ROW EXECUTE FUNCTION update_modified_column();

DROP TRIGGER IF EXISTS update_kpi_defs_modtime ON kpi_definitions;
CREATE TRIGGER update_kpi_defs_modtime BEFORE UPDATE ON kpi_definitions FOR EACH ROW EXECUTE FUNCTION update_modified_column();

DROP TRIGGER IF EXISTS update_settings_modtime ON app_settings;
CREATE TRIGGER update_settings_modtime BEFORE UPDATE ON app_settings FOR EACH ROW EXECUTE FUNCTION update_modified_column();
