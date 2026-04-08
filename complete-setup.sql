-- ==================================================
-- HR Performance Suite — Complete Supabase Setup
-- Combines Schema, Settings, Roles, and RLS (No Seed Data)
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
  ('company_name', 'Your Company'),
  ('company_short', 'COMPANY'),
  ('department_label', 'Human Resources Department'),
  ('logo_url', ''),
  ('primary_color', '#4f46e5'),
  ('assessment_scale_max', '10'),
  ('assessment_threshold', '7')
ON CONFLICT (key) DO NOTHING;

-- 1. EMPLOYEES TABLE — add missing columns if needed
DO $$ BEGIN
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS auth_email TEXT;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS kpi_targets JSONB DEFAULT '{}'::jsonb;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS assessment_updated_by TEXT;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS assessment_updated_at TIMESTAMPTZ;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS self_assessment_updated_by TEXT;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS self_assessment_updated_at TIMESTAMPTZ;
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE;
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

ALTER TABLE kpi_records
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_by TEXT;

CREATE TABLE IF NOT EXISTS admin_activity_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_employee_id TEXT REFERENCES employees(employee_id) ON DELETE SET NULL,
  actor_role TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'general',
  entity_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  ALTER TABLE admin_activity_log ALTER COLUMN actor_employee_id DROP NOT NULL;
  ALTER TABLE admin_activity_log DROP CONSTRAINT IF EXISTS admin_activity_log_actor_employee_id_fkey;
  ALTER TABLE admin_activity_log
    ADD CONSTRAINT admin_activity_log_actor_employee_id_fkey
    FOREIGN KEY (actor_employee_id) REFERENCES employees(employee_id) ON DELETE SET NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- 3. RLS — role-aware policies (superadmin / manager / employee)
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE competency_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_activity_log ENABLE ROW LEVEL SECURITY;

-- Helper functions for policy checks
CREATE OR REPLACE FUNCTION auth_employee_id()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.employee_id
  FROM public.employees e
  WHERE e.auth_id::text = auth.uid()::text
     OR (e.auth_email IS NOT NULL AND lower(e.auth_email) = lower(coalesce(auth.jwt() ->> 'email', '')))
  ORDER BY CASE WHEN e.auth_id::text = auth.uid()::text THEN 0 ELSE 1 END
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION auth_department()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.department
  FROM public.employees e
  WHERE e.employee_id = auth_employee_id()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.employee_id = auth_employee_id()
      AND e.role = 'superadmin'
  );
$$;

CREATE OR REPLACE FUNCTION is_manager()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.employee_id = auth_employee_id()
      AND e.role IN ('manager', 'superadmin')
  );
$$;
-- App Settings
DROP POLICY IF EXISTS "Allow read settings" ON app_settings;
DROP POLICY IF EXISTS "Allow write settings" ON app_settings;
DROP POLICY IF EXISTS "Read settings" ON app_settings;
DROP POLICY IF EXISTS "Read branding settings (anon)" ON app_settings;
DROP POLICY IF EXISTS "Superadmin manage settings" ON app_settings;
CREATE POLICY "Read settings"
ON app_settings FOR SELECT TO authenticated
USING (true);
CREATE POLICY "Read branding settings (anon)"
ON app_settings FOR SELECT TO anon
USING (
  key IN ('app_name', 'company_name', 'company_short', 'department_label')
);
CREATE POLICY "Superadmin manage settings"
ON app_settings FOR ALL TO authenticated
USING (is_superadmin())
WITH CHECK (is_superadmin());

-- Employees
DROP POLICY IF EXISTS "Allow read for authenticated users" ON employees;
DROP POLICY IF EXISTS "Allow insert for authenticated users" ON employees;
DROP POLICY IF EXISTS "Allow update for authenticated users" ON employees;
DROP POLICY IF EXISTS "Allow delete for authenticated users" ON employees;
DROP POLICY IF EXISTS "Allow read employees" ON employees;
DROP POLICY IF EXISTS "Allow insert employees" ON employees;
DROP POLICY IF EXISTS "Allow update employees" ON employees;
DROP POLICY IF EXISTS "Allow delete employees" ON employees;
DROP POLICY IF EXISTS "Read employees by scope" ON employees;
DROP POLICY IF EXISTS "Superadmin insert employees" ON employees;
DROP POLICY IF EXISTS "Update employees by scope" ON employees;
DROP POLICY IF EXISTS "Superadmin delete employees" ON employees;

CREATE POLICY "Read employees by scope"
ON employees FOR SELECT TO authenticated
USING (
  is_superadmin()
  OR employee_id = auth_employee_id()
  OR manager_id = auth_employee_id()
  OR (is_manager() AND department = auth_department())
  OR (auth_email IS NOT NULL AND lower(auth_email) = lower(coalesce(auth.jwt() ->> 'email', '')))
);

CREATE POLICY "Superadmin insert employees"
ON employees FOR INSERT TO authenticated
WITH CHECK (is_superadmin());

CREATE POLICY "Update employees by scope"
ON employees FOR UPDATE TO authenticated
USING (
  is_superadmin()
  OR employee_id = auth_employee_id()
  OR manager_id = auth_employee_id()
  OR (is_manager() AND department = auth_department())
)
WITH CHECK (
  is_superadmin()
  OR employee_id = auth_employee_id()
  OR manager_id = auth_employee_id()
  OR (is_manager() AND department = auth_department())
);

CREATE POLICY "Superadmin delete employees"
ON employees FOR DELETE TO authenticated
USING (is_superadmin());

-- Competency Config
DROP POLICY IF EXISTS "Allow read config" ON competency_config;
DROP POLICY IF EXISTS "Allow write config" ON competency_config;
DROP POLICY IF EXISTS "Read competency config" ON competency_config;
DROP POLICY IF EXISTS "Superadmin manage competency config" ON competency_config;
CREATE POLICY "Read competency config"
ON competency_config FOR SELECT TO authenticated
USING (true);
CREATE POLICY "Superadmin manage competency config"
ON competency_config FOR ALL TO authenticated
USING (is_superadmin())
WITH CHECK (is_superadmin());

-- KPI Definitions
DROP POLICY IF EXISTS "Allow read kpi defs" ON kpi_definitions;
DROP POLICY IF EXISTS "Allow write kpi defs" ON kpi_definitions;
DROP POLICY IF EXISTS "Read kpi definitions" ON kpi_definitions;
DROP POLICY IF EXISTS "Superadmin manage kpi definitions" ON kpi_definitions;
CREATE POLICY "Read kpi definitions"
ON kpi_definitions FOR SELECT TO authenticated
USING (true);
CREATE POLICY "Superadmin manage kpi definitions"
ON kpi_definitions FOR ALL TO authenticated
USING (is_superadmin())
WITH CHECK (is_superadmin());

-- KPI Records
DROP POLICY IF EXISTS "Allow read kpi records" ON kpi_records;
DROP POLICY IF EXISTS "Allow write kpi records" ON kpi_records;
DROP POLICY IF EXISTS "Read kpi records by scope" ON kpi_records;
DROP POLICY IF EXISTS "Insert kpi records by scope" ON kpi_records;
DROP POLICY IF EXISTS "Update kpi records by scope" ON kpi_records;
DROP POLICY IF EXISTS "Delete kpi records by scope" ON kpi_records;

CREATE POLICY "Read kpi records by scope"
ON kpi_records FOR SELECT TO authenticated
USING (
  is_superadmin()
  OR employee_id = auth_employee_id()
  OR EXISTS (
    SELECT 1
    FROM employees e
    WHERE e.employee_id = kpi_records.employee_id
      AND (
        e.manager_id = auth_employee_id()
        OR (is_manager() AND e.department = auth_department())
      )
  )
);

CREATE POLICY "Insert kpi records by scope"
ON kpi_records FOR INSERT TO authenticated
WITH CHECK (
  is_superadmin()
  OR employee_id = auth_employee_id()
  OR EXISTS (
    SELECT 1
    FROM employees e
    WHERE e.employee_id = kpi_records.employee_id
      AND (
        e.manager_id = auth_employee_id()
        OR (is_manager() AND e.department = auth_department())
      )
  )
);

CREATE POLICY "Update kpi records by scope"
ON kpi_records FOR UPDATE TO authenticated
USING (
  is_superadmin()
  OR employee_id = auth_employee_id()
  OR EXISTS (
    SELECT 1
    FROM employees e
    WHERE e.employee_id = kpi_records.employee_id
      AND (
        e.manager_id = auth_employee_id()
        OR (is_manager() AND e.department = auth_department())
      )
  )
)
WITH CHECK (
  is_superadmin()
  OR employee_id = auth_employee_id()
  OR EXISTS (
    SELECT 1
    FROM employees e
    WHERE e.employee_id = kpi_records.employee_id
      AND (
        e.manager_id = auth_employee_id()
        OR (is_manager() AND e.department = auth_department())
      )
  )
);

CREATE POLICY "Delete kpi records by scope"
ON kpi_records FOR DELETE TO authenticated
USING (
  is_superadmin()
  OR employee_id = auth_employee_id()
  OR EXISTS (
    SELECT 1
    FROM employees e
    WHERE e.employee_id = kpi_records.employee_id
      AND (
        e.manager_id = auth_employee_id()
        OR (is_manager() AND e.department = auth_department())
      )
  )
);

-- Activity Log
DROP POLICY IF EXISTS "Read activity logs by leadership" ON admin_activity_log;
DROP POLICY IF EXISTS "Insert own activity logs" ON admin_activity_log;
DROP POLICY IF EXISTS "Superadmin manage activity logs" ON admin_activity_log;

CREATE POLICY "Read activity logs by leadership"
ON admin_activity_log FOR SELECT TO authenticated
USING (
  is_manager()
  OR actor_employee_id = auth_employee_id()
);

CREATE POLICY "Insert own activity logs"
ON admin_activity_log FOR INSERT TO authenticated
WITH CHECK (actor_employee_id = auth_employee_id());

CREATE POLICY "Superadmin manage activity logs"
ON admin_activity_log FOR ALL TO authenticated
USING (is_superadmin())
WITH CHECK (is_superadmin());
-- 4. INDEXES
CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department);
CREATE INDEX IF NOT EXISTS idx_employees_auth_id ON employees(auth_id);
CREATE INDEX IF NOT EXISTS idx_employees_auth_email ON employees(auth_email);
CREATE INDEX IF NOT EXISTS idx_kpi_records_employee ON kpi_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_kpi_records_period ON kpi_records(period);
CREATE INDEX IF NOT EXISTS idx_kpi_records_kpi_id ON kpi_records(kpi_id);
CREATE INDEX IF NOT EXISTS idx_kpi_records_updated_at ON kpi_records(updated_at);
CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON admin_activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_actor ON admin_activity_log(actor_employee_id);

-- 5. TRIGGERS
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Prevent privilege/scope escalation through broad UPDATE policy.
-- Non-superadmin users may update assessment-related data but must not
-- modify identity/authorization fields.
CREATE OR REPLACE FUNCTION guard_employee_sensitive_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT is_superadmin() THEN
    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.department IS DISTINCT FROM OLD.department
       OR NEW.manager_id IS DISTINCT FROM OLD.manager_id
       OR NEW.auth_email IS DISTINCT FROM OLD.auth_email
       OR NEW.auth_id IS DISTINCT FROM OLD.auth_id THEN
      RAISE EXCEPTION 'Access denied: sensitive employee fields are superadmin-only.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_employees_modtime ON employees;
CREATE TRIGGER update_employees_modtime BEFORE UPDATE ON employees FOR EACH ROW EXECUTE FUNCTION update_modified_column();

DROP TRIGGER IF EXISTS guard_employee_sensitive_update_trg ON employees;
-- NOTE:
-- Create guard trigger AFTER seed/data migration section.
-- If created here, ON CONFLICT upserts below can be blocked in SQL editor context.

DROP TRIGGER IF EXISTS update_config_modtime ON competency_config;
CREATE TRIGGER update_config_modtime BEFORE UPDATE ON competency_config FOR EACH ROW EXECUTE FUNCTION update_modified_column();

DROP TRIGGER IF EXISTS update_kpi_defs_modtime ON kpi_definitions;
CREATE TRIGGER update_kpi_defs_modtime BEFORE UPDATE ON kpi_definitions FOR EACH ROW EXECUTE FUNCTION update_modified_column();

DROP TRIGGER IF EXISTS update_settings_modtime ON app_settings;
CREATE TRIGGER update_settings_modtime BEFORE UPDATE ON app_settings FOR EACH ROW EXECUTE FUNCTION update_modified_column();

DROP TRIGGER IF EXISTS update_kpi_records_modtime ON kpi_records;
CREATE TRIGGER update_kpi_records_modtime BEFORE UPDATE ON kpi_records FOR EACH ROW EXECUTE FUNCTION update_modified_column();


-- ==================================================
-- DATA MIGRATION — Employees + Competency Config
-- ==================================================

-- Seed data has been intentionally removed from this repository.
-- Import employees, competency configuration, and KPI definitions from private sources only.

-- Enable sensitive update guard only after migration has completed.
DROP TRIGGER IF EXISTS guard_employee_sensitive_update_trg ON employees;
CREATE TRIGGER guard_employee_sensitive_update_trg BEFORE UPDATE ON employees FOR EACH ROW EXECUTE FUNCTION guard_employee_sensitive_update();


-- ==================================================
-- 6. NORMALIZATION EXTENSIONS (ASSESSMENT/TRAINING/SCORING + PIP/PROBATION)
-- ==================================================

-- ---------- TABLES ----------
CREATE TABLE IF NOT EXISTS employee_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id TEXT NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
  assessment_type TEXT NOT NULL CHECK (assessment_type IN ('manager', 'self')),
  percentage NUMERIC NOT NULL DEFAULT 0,
  seniority TEXT DEFAULT '',
  assessed_at TIMESTAMPTZ,
  assessed_by TEXT,
  source_date TEXT DEFAULT '-',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (employee_id, assessment_type)
);

CREATE TABLE IF NOT EXISTS employee_assessment_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES employee_assessments(id) ON DELETE CASCADE,
  competency_name TEXT NOT NULL,
  score NUMERIC NOT NULL DEFAULT 0,
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (assessment_id, competency_name)
);

CREATE TABLE IF NOT EXISTS employee_assessment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id TEXT NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
  assessment_type TEXT NOT NULL DEFAULT 'manager' CHECK (assessment_type IN ('manager', 'self')),
  assessed_on TEXT DEFAULT '-',
  percentage NUMERIC NOT NULL DEFAULT 0,
  seniority TEXT DEFAULT '',
  position TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (employee_id, assessment_type, assessed_on, percentage, seniority, position)
);

CREATE TABLE IF NOT EXISTS employee_training_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id TEXT NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
  course TEXT NOT NULL,
  start_date TEXT DEFAULT '',
  end_date TEXT DEFAULT '',
  provider TEXT DEFAULT '',
  status TEXT DEFAULT 'ongoing' CHECK (status IN ('planned', 'ongoing', 'completed', 'approved')),
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (employee_id, course, start_date, end_date, provider, status)
);

CREATE TABLE IF NOT EXISTS employee_performance_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id TEXT NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  score_type TEXT NOT NULL DEFAULT 'kpi_weighted',
  total_score NUMERIC NOT NULL DEFAULT 0,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  calculated_by TEXT,
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (employee_id, period, score_type)
);

CREATE TABLE IF NOT EXISTS kpi_weight_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_name TEXT NOT NULL,
  department TEXT DEFAULT '',
  position TEXT DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (profile_name, department, position)
);

CREATE TABLE IF NOT EXISTS kpi_weight_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES kpi_weight_profiles(id) ON DELETE CASCADE,
  kpi_id UUID NOT NULL REFERENCES kpi_definitions(id) ON DELETE CASCADE,
  weight_pct NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (profile_id, kpi_id)
);

CREATE TABLE IF NOT EXISTS probation_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id TEXT NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
  review_period_start DATE,
  review_period_end DATE,
  quantitative_score NUMERIC NOT NULL DEFAULT 0,
  qualitative_score NUMERIC NOT NULL DEFAULT 0,
  final_score NUMERIC NOT NULL DEFAULT 0,
  decision TEXT NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending', 'pass', 'extend', 'fail')),
  manager_notes TEXT DEFAULT '',
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS probation_qualitative_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  probation_review_id UUID NOT NULL REFERENCES probation_reviews(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  score NUMERIC NOT NULL DEFAULT 0,
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (probation_review_id, item_name)
);

CREATE TABLE IF NOT EXISTS pip_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id TEXT NOT NULL REFERENCES employees(employee_id) ON DELETE CASCADE,
  trigger_reason TEXT DEFAULT '',
  trigger_period TEXT DEFAULT '',
  start_date DATE,
  target_end_date DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'extended', 'escalated', 'cancelled')),
  owner_manager_id TEXT,
  summary TEXT DEFAULT '',
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pip_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pip_plan_id UUID NOT NULL REFERENCES pip_plans(id) ON DELETE CASCADE,
  action_title TEXT NOT NULL,
  action_detail TEXT DEFAULT '',
  due_date DATE,
  progress_pct NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done', 'blocked')),
  checkpoint_note TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ---------- RLS ENABLE ----------
ALTER TABLE employee_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_assessment_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_assessment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_training_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_performance_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_weight_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_weight_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE probation_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE probation_qualitative_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE pip_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE pip_actions ENABLE ROW LEVEL SECURITY;

-- Access helper for normalized tables
CREATE OR REPLACE FUNCTION can_access_employee(target_employee_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    is_superadmin()
    OR target_employee_id = auth_employee_id()
    OR EXISTS (
      SELECT 1
      FROM public.employees e
      WHERE e.employee_id = target_employee_id
        AND (
          e.manager_id = auth_employee_id()
          OR (is_manager() AND e.department = auth_department())
        )
    )
  );
$$;

-- ---------- POLICIES ----------
DROP POLICY IF EXISTS "Access employee assessments by scope" ON employee_assessments;
CREATE POLICY "Access employee assessments by scope"
ON employee_assessments FOR ALL TO authenticated
USING (can_access_employee(employee_id))
WITH CHECK (can_access_employee(employee_id));

DROP POLICY IF EXISTS "Access employee assessment scores by scope" ON employee_assessment_scores;
CREATE POLICY "Access employee assessment scores by scope"
ON employee_assessment_scores FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM employee_assessments ea
    WHERE ea.id = employee_assessment_scores.assessment_id
      AND can_access_employee(ea.employee_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM employee_assessments ea
    WHERE ea.id = employee_assessment_scores.assessment_id
      AND can_access_employee(ea.employee_id)
  )
);

DROP POLICY IF EXISTS "Access employee assessment history by scope" ON employee_assessment_history;
CREATE POLICY "Access employee assessment history by scope"
ON employee_assessment_history FOR ALL TO authenticated
USING (can_access_employee(employee_id))
WITH CHECK (can_access_employee(employee_id));

DROP POLICY IF EXISTS "Access employee training records by scope" ON employee_training_records;
CREATE POLICY "Access employee training records by scope"
ON employee_training_records FOR ALL TO authenticated
USING (can_access_employee(employee_id))
WITH CHECK (can_access_employee(employee_id));

DROP POLICY IF EXISTS "Access employee performance scores by scope" ON employee_performance_scores;
CREATE POLICY "Access employee performance scores by scope"
ON employee_performance_scores FOR ALL TO authenticated
USING (can_access_employee(employee_id))
WITH CHECK (can_access_employee(employee_id));

DROP POLICY IF EXISTS "Read KPI weight profiles" ON kpi_weight_profiles;
DROP POLICY IF EXISTS "Superadmin manage KPI weight profiles" ON kpi_weight_profiles;
CREATE POLICY "Read KPI weight profiles"
ON kpi_weight_profiles FOR SELECT TO authenticated
USING (true);
CREATE POLICY "Superadmin manage KPI weight profiles"
ON kpi_weight_profiles FOR ALL TO authenticated
USING (is_superadmin())
WITH CHECK (is_superadmin());

DROP POLICY IF EXISTS "Read KPI weight items" ON kpi_weight_items;
DROP POLICY IF EXISTS "Superadmin manage KPI weight items" ON kpi_weight_items;
CREATE POLICY "Read KPI weight items"
ON kpi_weight_items FOR SELECT TO authenticated
USING (true);
CREATE POLICY "Superadmin manage KPI weight items"
ON kpi_weight_items FOR ALL TO authenticated
USING (is_superadmin())
WITH CHECK (is_superadmin());

DROP POLICY IF EXISTS "Access probation reviews by scope" ON probation_reviews;
CREATE POLICY "Access probation reviews by scope"
ON probation_reviews FOR ALL TO authenticated
USING (can_access_employee(employee_id))
WITH CHECK (can_access_employee(employee_id));

DROP POLICY IF EXISTS "Access probation qualitative items by scope" ON probation_qualitative_items;
CREATE POLICY "Access probation qualitative items by scope"
ON probation_qualitative_items FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM probation_reviews pr
    WHERE pr.id = probation_qualitative_items.probation_review_id
      AND can_access_employee(pr.employee_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM probation_reviews pr
    WHERE pr.id = probation_qualitative_items.probation_review_id
      AND can_access_employee(pr.employee_id)
  )
);

DROP POLICY IF EXISTS "Access PIP plans by scope" ON pip_plans;
CREATE POLICY "Access PIP plans by scope"
ON pip_plans FOR ALL TO authenticated
USING (can_access_employee(employee_id))
WITH CHECK (can_access_employee(employee_id));

DROP POLICY IF EXISTS "Access PIP actions by scope" ON pip_actions;
CREATE POLICY "Access PIP actions by scope"
ON pip_actions FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM pip_plans pp
    WHERE pp.id = pip_actions.pip_plan_id
      AND can_access_employee(pp.employee_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM pip_plans pp
    WHERE pp.id = pip_actions.pip_plan_id
      AND can_access_employee(pp.employee_id)
  )
);

-- ---------- INDEXES ----------
CREATE INDEX IF NOT EXISTS idx_employee_assessments_employee ON employee_assessments(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_assessments_assessed_at ON employee_assessments(assessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_employee_assessment_scores_assessment ON employee_assessment_scores(assessment_id);
CREATE INDEX IF NOT EXISTS idx_employee_assessment_history_employee ON employee_assessment_history(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_training_records_employee ON employee_training_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_performance_scores_employee_period ON employee_performance_scores(employee_id, period);
CREATE INDEX IF NOT EXISTS idx_probation_reviews_employee ON probation_reviews(employee_id);
CREATE INDEX IF NOT EXISTS idx_probation_reviews_decision ON probation_reviews(decision);
CREATE INDEX IF NOT EXISTS idx_pip_plans_employee_status ON pip_plans(employee_id, status);
CREATE INDEX IF NOT EXISTS idx_pip_actions_plan_status ON pip_actions(pip_plan_id, status);
CREATE INDEX IF NOT EXISTS idx_kpi_weight_items_profile ON kpi_weight_items(profile_id);
CREATE INDEX IF NOT EXISTS idx_kpi_weight_items_kpi ON kpi_weight_items(kpi_id);

-- ---------- DATA API GRANTS ----------
-- RLS controls row access, but the Supabase Data API also needs table grants
-- for anon/authenticated roles. Without these grants the dashboard shows
-- "API disabled" even when policies exist.
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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pip_plans TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pip_actions TO authenticated;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ---------- TRIGGERS ----------
DROP TRIGGER IF EXISTS update_employee_assessments_modtime ON employee_assessments;
CREATE TRIGGER update_employee_assessments_modtime BEFORE UPDATE ON employee_assessments FOR EACH ROW EXECUTE FUNCTION update_modified_column();

DROP TRIGGER IF EXISTS update_employee_assessment_scores_modtime ON employee_assessment_scores;
CREATE TRIGGER update_employee_assessment_scores_modtime BEFORE UPDATE ON employee_assessment_scores FOR EACH ROW EXECUTE FUNCTION update_modified_column();

DROP TRIGGER IF EXISTS update_employee_training_records_modtime ON employee_training_records;
CREATE TRIGGER update_employee_training_records_modtime BEFORE UPDATE ON employee_training_records FOR EACH ROW EXECUTE FUNCTION update_modified_column();

DROP TRIGGER IF EXISTS update_employee_performance_scores_modtime ON employee_performance_scores;
CREATE TRIGGER update_employee_performance_scores_modtime BEFORE UPDATE ON employee_performance_scores FOR EACH ROW EXECUTE FUNCTION update_modified_column();

DROP TRIGGER IF EXISTS update_kpi_weight_profiles_modtime ON kpi_weight_profiles;
CREATE TRIGGER update_kpi_weight_profiles_modtime BEFORE UPDATE ON kpi_weight_profiles FOR EACH ROW EXECUTE FUNCTION update_modified_column();

DROP TRIGGER IF EXISTS update_kpi_weight_items_modtime ON kpi_weight_items;
CREATE TRIGGER update_kpi_weight_items_modtime BEFORE UPDATE ON kpi_weight_items FOR EACH ROW EXECUTE FUNCTION update_modified_column();

DROP TRIGGER IF EXISTS update_probation_reviews_modtime ON probation_reviews;
CREATE TRIGGER update_probation_reviews_modtime BEFORE UPDATE ON probation_reviews FOR EACH ROW EXECUTE FUNCTION update_modified_column();

DROP TRIGGER IF EXISTS update_probation_qualitative_items_modtime ON probation_qualitative_items;
CREATE TRIGGER update_probation_qualitative_items_modtime BEFORE UPDATE ON probation_qualitative_items FOR EACH ROW EXECUTE FUNCTION update_modified_column();

DROP TRIGGER IF EXISTS update_pip_plans_modtime ON pip_plans;
CREATE TRIGGER update_pip_plans_modtime BEFORE UPDATE ON pip_plans FOR EACH ROW EXECUTE FUNCTION update_modified_column();

DROP TRIGGER IF EXISTS update_pip_actions_modtime ON pip_actions;
CREATE TRIGGER update_pip_actions_modtime BEFORE UPDATE ON pip_actions FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- ---------- LEGACY DATA MIGRATION (FROM employees JSON FIELDS) ----------
INSERT INTO employee_assessments (employee_id, assessment_type, percentage, seniority, assessed_at, assessed_by, source_date)
SELECT
  e.employee_id,
  'manager',
  COALESCE(e.percentage, 0),
  COALESCE(e.seniority, ''),
  e.assessment_updated_at,
  e.assessment_updated_by,
  COALESCE(NULLIF(e.date_updated, ''), COALESCE(NULLIF(e.date_created, ''), '-'))
FROM employees e
WHERE COALESCE(e.percentage, 0) > 0
   OR jsonb_array_length(COALESCE(e.scores, '[]'::jsonb)) > 0
ON CONFLICT (employee_id, assessment_type)
DO UPDATE SET
  percentage = EXCLUDED.percentage,
  seniority = EXCLUDED.seniority,
  assessed_at = EXCLUDED.assessed_at,
  assessed_by = EXCLUDED.assessed_by,
  source_date = EXCLUDED.source_date,
  updated_at = NOW();

INSERT INTO employee_assessments (employee_id, assessment_type, percentage, seniority, assessed_at, assessed_by, source_date)
SELECT
  e.employee_id,
  'self',
  COALESCE(e.self_percentage, 0),
  COALESCE(e.seniority, ''),
  e.self_assessment_updated_at,
  e.self_assessment_updated_by,
  COALESCE(NULLIF(e.self_date, ''), '-')
FROM employees e
WHERE COALESCE(e.self_percentage, 0) > 0
   OR jsonb_array_length(COALESCE(e.self_scores, '[]'::jsonb)) > 0
ON CONFLICT (employee_id, assessment_type)
DO UPDATE SET
  percentage = EXCLUDED.percentage,
  seniority = EXCLUDED.seniority,
  assessed_at = EXCLUDED.assessed_at,
  assessed_by = EXCLUDED.assessed_by,
  source_date = EXCLUDED.source_date,
  updated_at = NOW();

INSERT INTO employee_assessment_scores (assessment_id, competency_name, score, note)
SELECT
  ea.id,
  score_item ->> 'q',
  CASE WHEN COALESCE(score_item ->> 's', '') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (score_item ->> 's')::numeric ELSE 0 END,
  COALESCE(score_item ->> 'n', '')
FROM employees e
JOIN employee_assessments ea ON ea.employee_id = e.employee_id AND ea.assessment_type = 'manager'
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(e.scores, '[]'::jsonb)) score_item
WHERE COALESCE(score_item ->> 'q', '') <> ''
ON CONFLICT (assessment_id, competency_name)
DO UPDATE SET
  score = EXCLUDED.score,
  note = EXCLUDED.note,
  updated_at = NOW();

INSERT INTO employee_assessment_scores (assessment_id, competency_name, score, note)
SELECT
  ea.id,
  score_item ->> 'q',
  CASE WHEN COALESCE(score_item ->> 's', '') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (score_item ->> 's')::numeric ELSE 0 END,
  COALESCE(score_item ->> 'n', '')
FROM employees e
JOIN employee_assessments ea ON ea.employee_id = e.employee_id AND ea.assessment_type = 'self'
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(e.self_scores, '[]'::jsonb)) score_item
WHERE COALESCE(score_item ->> 'q', '') <> ''
ON CONFLICT (assessment_id, competency_name)
DO UPDATE SET
  score = EXCLUDED.score,
  note = EXCLUDED.note,
  updated_at = NOW();

INSERT INTO employee_assessment_history (employee_id, assessment_type, assessed_on, percentage, seniority, position)
SELECT
  e.employee_id,
  'manager',
  COALESCE(hist_item ->> 'date', '-'),
  CASE WHEN COALESCE(hist_item ->> 'score', '') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (hist_item ->> 'score')::numeric ELSE 0 END,
  COALESCE(hist_item ->> 'seniority', COALESCE(e.seniority, '')),
  COALESCE(hist_item ->> 'position', COALESCE(e.position, ''))
FROM employees e
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(e.history, '[]'::jsonb)) hist_item
ON CONFLICT (employee_id, assessment_type, assessed_on, percentage, seniority, position)
DO NOTHING;

INSERT INTO employee_training_records (employee_id, course, start_date, end_date, provider, status, notes)
SELECT
  e.employee_id,
  COALESCE(train_item ->> 'course', ''),
  COALESCE(train_item ->> 'start', ''),
  COALESCE(train_item ->> 'end', ''),
  COALESCE(train_item ->> 'provider', ''),
  CASE
    WHEN lower(COALESCE(train_item ->> 'status', 'ongoing')) IN ('planned', 'ongoing', 'completed', 'approved')
      THEN lower(COALESCE(train_item ->> 'status', 'ongoing'))
    ELSE 'ongoing'
  END,
  ''
FROM employees e
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(e.training_history, '[]'::jsonb)) train_item
WHERE COALESCE(train_item ->> 'course', '') <> ''
ON CONFLICT (employee_id, course, start_date, end_date, provider, status)
DO UPDATE SET
  notes = EXCLUDED.notes,
  updated_at = NOW();
