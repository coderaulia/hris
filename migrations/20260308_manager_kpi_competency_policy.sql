-- ==================================================
-- Manager RLS Extension: KPI Definitions + Competency Config
-- Date: 2026-03-08
-- Safe: additive only
-- ==================================================

BEGIN;

ALTER TABLE competency_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_definitions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='competency_config' AND policyname='Manager manage competency config'
  ) THEN
    EXECUTE 'CREATE POLICY "Manager manage competency config" ON public.competency_config FOR ALL TO authenticated USING (is_manager()) WITH CHECK (is_manager())';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='kpi_definitions' AND policyname='Manager manage kpi definitions'
  ) THEN
    EXECUTE 'CREATE POLICY "Manager manage kpi definitions" ON public.kpi_definitions FOR ALL TO authenticated USING (is_manager()) WITH CHECK (is_manager())';
  END IF;
END $$;

COMMIT;
