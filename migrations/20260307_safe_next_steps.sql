-- ==================================================
-- SAFE MIGRATION: normalized assessment/training + scoring, probation, PIP
-- Date: 2026-03-07
-- Safety: additive only (no DROP TABLE, no DELETE/TRUNCATE)
-- Note: assumes base auth/role helpers already exist: is_superadmin(), is_manager(), auth_employee_id(), auth_department()
-- ==================================================

BEGIN;

CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

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

-- ---------- POLICIES (create only if missing) ----------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='employee_assessments' AND policyname='Access employee assessments by scope') THEN
    EXECUTE 'CREATE POLICY "Access employee assessments by scope" ON public.employee_assessments FOR ALL TO authenticated USING (can_access_employee(employee_id)) WITH CHECK (can_access_employee(employee_id))';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='employee_assessment_scores' AND policyname='Access employee assessment scores by scope') THEN
    EXECUTE 'CREATE POLICY "Access employee assessment scores by scope" ON public.employee_assessment_scores FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.employee_assessments ea WHERE ea.id = employee_assessment_scores.assessment_id AND can_access_employee(ea.employee_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.employee_assessments ea WHERE ea.id = employee_assessment_scores.assessment_id AND can_access_employee(ea.employee_id)))';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='employee_assessment_history' AND policyname='Access employee assessment history by scope') THEN
    EXECUTE 'CREATE POLICY "Access employee assessment history by scope" ON public.employee_assessment_history FOR ALL TO authenticated USING (can_access_employee(employee_id)) WITH CHECK (can_access_employee(employee_id))';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='employee_training_records' AND policyname='Access employee training records by scope') THEN
    EXECUTE 'CREATE POLICY "Access employee training records by scope" ON public.employee_training_records FOR ALL TO authenticated USING (can_access_employee(employee_id)) WITH CHECK (can_access_employee(employee_id))';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='employee_performance_scores' AND policyname='Access employee performance scores by scope') THEN
    EXECUTE 'CREATE POLICY "Access employee performance scores by scope" ON public.employee_performance_scores FOR ALL TO authenticated USING (can_access_employee(employee_id)) WITH CHECK (can_access_employee(employee_id))';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='kpi_weight_profiles' AND policyname='Read KPI weight profiles') THEN
    EXECUTE 'CREATE POLICY "Read KPI weight profiles" ON public.kpi_weight_profiles FOR SELECT TO authenticated USING (true)';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='kpi_weight_profiles' AND policyname='Superadmin manage KPI weight profiles') THEN
    EXECUTE 'CREATE POLICY "Superadmin manage KPI weight profiles" ON public.kpi_weight_profiles FOR ALL TO authenticated USING (is_superadmin()) WITH CHECK (is_superadmin())';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='kpi_weight_items' AND policyname='Read KPI weight items') THEN
    EXECUTE 'CREATE POLICY "Read KPI weight items" ON public.kpi_weight_items FOR SELECT TO authenticated USING (true)';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='kpi_weight_items' AND policyname='Superadmin manage KPI weight items') THEN
    EXECUTE 'CREATE POLICY "Superadmin manage KPI weight items" ON public.kpi_weight_items FOR ALL TO authenticated USING (is_superadmin()) WITH CHECK (is_superadmin())';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='probation_reviews' AND policyname='Access probation reviews by scope') THEN
    EXECUTE 'CREATE POLICY "Access probation reviews by scope" ON public.probation_reviews FOR ALL TO authenticated USING (can_access_employee(employee_id)) WITH CHECK (can_access_employee(employee_id))';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='probation_qualitative_items' AND policyname='Access probation qualitative items by scope') THEN
    EXECUTE 'CREATE POLICY "Access probation qualitative items by scope" ON public.probation_qualitative_items FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.probation_reviews pr WHERE pr.id = probation_qualitative_items.probation_review_id AND can_access_employee(pr.employee_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.probation_reviews pr WHERE pr.id = probation_qualitative_items.probation_review_id AND can_access_employee(pr.employee_id)))';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='pip_plans' AND policyname='Access PIP plans by scope') THEN
    EXECUTE 'CREATE POLICY "Access PIP plans by scope" ON public.pip_plans FOR ALL TO authenticated USING (can_access_employee(employee_id)) WITH CHECK (can_access_employee(employee_id))';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='pip_actions' AND policyname='Access PIP actions by scope') THEN
    EXECUTE 'CREATE POLICY "Access PIP actions by scope" ON public.pip_actions FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.pip_plans pp WHERE pp.id = pip_actions.pip_plan_id AND can_access_employee(pp.employee_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.pip_plans pp WHERE pp.id = pip_actions.pip_plan_id AND can_access_employee(pp.employee_id)))';
  END IF;
END $$;

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

-- ---------- TRIGGERS (create only if missing) ----------
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_employee_assessments_modtime') THEN
  CREATE TRIGGER update_employee_assessments_modtime BEFORE UPDATE ON employee_assessments FOR EACH ROW EXECUTE FUNCTION update_modified_column();
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_employee_assessment_scores_modtime') THEN
  CREATE TRIGGER update_employee_assessment_scores_modtime BEFORE UPDATE ON employee_assessment_scores FOR EACH ROW EXECUTE FUNCTION update_modified_column();
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_employee_training_records_modtime') THEN
  CREATE TRIGGER update_employee_training_records_modtime BEFORE UPDATE ON employee_training_records FOR EACH ROW EXECUTE FUNCTION update_modified_column();
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_employee_performance_scores_modtime') THEN
  CREATE TRIGGER update_employee_performance_scores_modtime BEFORE UPDATE ON employee_performance_scores FOR EACH ROW EXECUTE FUNCTION update_modified_column();
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_kpi_weight_profiles_modtime') THEN
  CREATE TRIGGER update_kpi_weight_profiles_modtime BEFORE UPDATE ON kpi_weight_profiles FOR EACH ROW EXECUTE FUNCTION update_modified_column();
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_kpi_weight_items_modtime') THEN
  CREATE TRIGGER update_kpi_weight_items_modtime BEFORE UPDATE ON kpi_weight_items FOR EACH ROW EXECUTE FUNCTION update_modified_column();
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_probation_reviews_modtime') THEN
  CREATE TRIGGER update_probation_reviews_modtime BEFORE UPDATE ON probation_reviews FOR EACH ROW EXECUTE FUNCTION update_modified_column();
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_probation_qualitative_items_modtime') THEN
  CREATE TRIGGER update_probation_qualitative_items_modtime BEFORE UPDATE ON probation_qualitative_items FOR EACH ROW EXECUTE FUNCTION update_modified_column();
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_pip_plans_modtime') THEN
  CREATE TRIGGER update_pip_plans_modtime BEFORE UPDATE ON pip_plans FOR EACH ROW EXECUTE FUNCTION update_modified_column();
END IF; END $$;

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='update_pip_actions_modtime') THEN
  CREATE TRIGGER update_pip_actions_modtime BEFORE UPDATE ON pip_actions FOR EACH ROW EXECUTE FUNCTION update_modified_column();
END IF; END $$;

COMMIT;




