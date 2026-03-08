-- ==================================================
-- Sprint 4: KPI Governance
-- Date: 2026-03-08
-- Scope:
-- - Version history for KPI definitions and employee KPI targets
-- - Optional approval workflow metadata
-- - Snapshot columns on KPI records to prevent retroactive score drift
-- - RLS policies for governed tables
-- ==================================================

BEGIN;

INSERT INTO public.app_settings (key, value)
VALUES ('kpi_hr_approval_required', 'false')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.kpi_definitions
  ADD COLUMN IF NOT EXISTS effective_period TEXT,
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS approval_required BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS latest_version_no INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS approved_by TEXT,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

UPDATE public.kpi_definitions
SET effective_period = to_char(COALESCE(created_at, NOW()), 'YYYY-MM')
WHERE COALESCE(NULLIF(effective_period, ''), '') = '';

UPDATE public.kpi_definitions
SET approval_status = 'approved'
WHERE COALESCE(NULLIF(approval_status, ''), '') NOT IN ('approved', 'pending', 'rejected');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'kpi_definitions_approval_status_check'
      AND conrelid = 'public.kpi_definitions'::regclass
  ) THEN
    ALTER TABLE public.kpi_definitions
      ADD CONSTRAINT kpi_definitions_approval_status_check
      CHECK (approval_status IN ('approved', 'pending', 'rejected'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'kpi_definitions_effective_period_check'
      AND conrelid = 'public.kpi_definitions'::regclass
  ) THEN
    ALTER TABLE public.kpi_definitions
      ADD CONSTRAINT kpi_definitions_effective_period_check
      CHECK (effective_period ~ '^\d{4}-(0[1-9]|1[0-2])$');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.kpi_definition_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_definition_id UUID NOT NULL REFERENCES public.kpi_definitions(id) ON DELETE CASCADE,
  version_no INTEGER NOT NULL,
  effective_period TEXT NOT NULL CHECK (effective_period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  category TEXT DEFAULT 'General',
  target NUMERIC NOT NULL DEFAULT 0,
  unit TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected')),
  request_note TEXT DEFAULT '',
  requested_by TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  rejected_by TEXT,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (kpi_definition_id, version_no)
);

CREATE INDEX IF NOT EXISTS idx_kpi_definition_versions_scope
  ON public.kpi_definition_versions(kpi_definition_id, effective_period, status);
CREATE INDEX IF NOT EXISTS idx_kpi_definition_versions_status
  ON public.kpi_definition_versions(status, requested_at DESC);

CREATE TABLE IF NOT EXISTS public.employee_kpi_target_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id TEXT NOT NULL REFERENCES public.employees(employee_id) ON DELETE CASCADE,
  kpi_id UUID NOT NULL REFERENCES public.kpi_definitions(id) ON DELETE CASCADE,
  effective_period TEXT NOT NULL CHECK (effective_period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  version_no INTEGER NOT NULL,
  target_value NUMERIC NULL,
  unit TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected')),
  request_note TEXT DEFAULT '',
  requested_by TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  rejected_by TEXT,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, kpi_id, effective_period, version_no)
);

CREATE INDEX IF NOT EXISTS idx_employee_kpi_target_versions_scope
  ON public.employee_kpi_target_versions(employee_id, kpi_id, effective_period, status);
CREATE INDEX IF NOT EXISTS idx_employee_kpi_target_versions_status
  ON public.employee_kpi_target_versions(status, requested_at DESC);

ALTER TABLE public.kpi_records
  ADD COLUMN IF NOT EXISTS target_snapshot NUMERIC,
  ADD COLUMN IF NOT EXISTS kpi_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS kpi_unit_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS kpi_category_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS definition_version_id UUID,
  ADD COLUMN IF NOT EXISTS target_version_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'kpi_records_definition_version_id_fkey'
      AND conrelid = 'public.kpi_records'::regclass
  ) THEN
    ALTER TABLE public.kpi_records
      ADD CONSTRAINT kpi_records_definition_version_id_fkey
      FOREIGN KEY (definition_version_id)
      REFERENCES public.kpi_definition_versions(id)
      ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'kpi_records_target_version_id_fkey'
      AND conrelid = 'public.kpi_records'::regclass
  ) THEN
    ALTER TABLE public.kpi_records
      ADD CONSTRAINT kpi_records_target_version_id_fkey
      FOREIGN KEY (target_version_id)
      REFERENCES public.employee_kpi_target_versions(id)
      ON DELETE SET NULL;
  END IF;
END $$;

INSERT INTO public.kpi_definition_versions (
  kpi_definition_id,
  version_no,
  effective_period,
  name,
  description,
  category,
  target,
  unit,
  status,
  requested_by,
  requested_at,
  approved_by,
  approved_at,
  created_at,
  updated_at
)
SELECT
  kd.id,
  1,
  COALESCE(NULLIF(kd.effective_period, ''), to_char(COALESCE(kd.created_at, NOW()), 'YYYY-MM')),
  kd.name,
  COALESCE(kd.description, ''),
  COALESCE(kd.category, 'General'),
  COALESCE(kd.target, 0),
  COALESCE(kd.unit, ''),
  CASE
    WHEN kd.approval_status IN ('approved', 'pending', 'rejected') THEN kd.approval_status
    ELSE 'approved'
  END,
  kd.approved_by,
  COALESCE(kd.created_at, NOW()),
  kd.approved_by,
  COALESCE(kd.approved_at, kd.updated_at, kd.created_at, NOW()),
  COALESCE(kd.created_at, NOW()),
  COALESCE(kd.updated_at, NOW())
FROM public.kpi_definitions kd
WHERE NOT EXISTS (
  SELECT 1
  FROM public.kpi_definition_versions kv
  WHERE kv.kpi_definition_id = kd.id
);

UPDATE public.kpi_definitions kd
SET latest_version_no = ver.max_version
FROM (
  SELECT kpi_definition_id, MAX(version_no) AS max_version
  FROM public.kpi_definition_versions
  GROUP BY kpi_definition_id
) ver
WHERE ver.kpi_definition_id = kd.id;

UPDATE public.kpi_records kr
SET
  target_snapshot = COALESCE(kr.target_snapshot, kd.target),
  kpi_name_snapshot = COALESCE(NULLIF(kr.kpi_name_snapshot, ''), kd.name),
  kpi_unit_snapshot = COALESCE(NULLIF(kr.kpi_unit_snapshot, ''), kd.unit),
  kpi_category_snapshot = COALESCE(NULLIF(kr.kpi_category_snapshot, ''), kd.category)
FROM public.kpi_definitions kd
WHERE kd.id = kr.kpi_id;

ALTER TABLE public.kpi_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_definition_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_kpi_target_versions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_manage_kpi_category(target_category TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    is_superadmin()
    OR EXISTS (
      SELECT 1
      FROM public.employees e
      WHERE e.employee_id = auth_employee_id()
        AND e.role = 'hr'
    )
    OR (
      is_manager()
      AND (
        COALESCE(NULLIF(target_category, ''), 'General') = 'General'
        OR EXISTS (
          SELECT 1
          FROM public.employees scoped
          WHERE scoped.role = 'employee'
            AND scoped.position = COALESCE(NULLIF(target_category, ''), 'General')
            AND (
              scoped.manager_id = auth_employee_id()
              OR (
                scoped.department <> ''
                AND scoped.department = auth_department()
              )
            )
        )
      )
    )
  );
$$;

DROP POLICY IF EXISTS "Manager manage kpi definitions" ON public.kpi_definitions;
DROP POLICY IF EXISTS "Read KPI definitions" ON public.kpi_definitions;
CREATE POLICY "Read KPI definitions"
ON public.kpi_definitions FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "Manage KPI definitions by category" ON public.kpi_definitions;
CREATE POLICY "Manage KPI definitions by category"
ON public.kpi_definitions FOR ALL TO authenticated
USING (can_manage_kpi_category(category))
WITH CHECK (can_manage_kpi_category(category));

DROP POLICY IF EXISTS "Read KPI definition versions" ON public.kpi_definition_versions;
CREATE POLICY "Read KPI definition versions"
ON public.kpi_definition_versions FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "Manage KPI definition versions (manager submit)" ON public.kpi_definition_versions;
CREATE POLICY "Manage KPI definition versions (manager submit)"
ON public.kpi_definition_versions FOR INSERT TO authenticated
WITH CHECK (can_manage_kpi_category(category));

DROP POLICY IF EXISTS "Update KPI definition versions (approver)" ON public.kpi_definition_versions;
CREATE POLICY "Update KPI definition versions (approver)"
ON public.kpi_definition_versions FOR UPDATE TO authenticated
USING (
  is_superadmin()
  OR EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.employee_id = auth_employee_id()
      AND e.role = 'hr'
  )
)
WITH CHECK (
  is_superadmin()
  OR EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.employee_id = auth_employee_id()
      AND e.role = 'hr'
  )
);

DROP POLICY IF EXISTS "Delete KPI definition versions (superadmin)" ON public.kpi_definition_versions;
CREATE POLICY "Delete KPI definition versions (superadmin)"
ON public.kpi_definition_versions FOR DELETE TO authenticated
USING (is_superadmin());

DROP POLICY IF EXISTS "Read employee KPI target versions by scope" ON public.employee_kpi_target_versions;
CREATE POLICY "Read employee KPI target versions by scope"
ON public.employee_kpi_target_versions FOR SELECT TO authenticated
USING (
  can_access_employee(employee_id)
  OR is_superadmin()
  OR EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.employee_id = auth_employee_id()
      AND e.role = 'hr'
  )
);

DROP POLICY IF EXISTS "Insert employee KPI target versions by scope" ON public.employee_kpi_target_versions;
CREATE POLICY "Insert employee KPI target versions by scope"
ON public.employee_kpi_target_versions FOR INSERT TO authenticated
WITH CHECK (
  (is_manager() AND can_access_employee(employee_id))
  OR is_superadmin()
  OR EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.employee_id = auth_employee_id()
      AND e.role = 'hr'
  )
);

DROP POLICY IF EXISTS "Update employee KPI target versions by scope" ON public.employee_kpi_target_versions;
CREATE POLICY "Update employee KPI target versions by scope"
ON public.employee_kpi_target_versions FOR UPDATE TO authenticated
USING (
  is_superadmin()
  OR EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.employee_id = auth_employee_id()
      AND e.role = 'hr'
  )
)
WITH CHECK (
  is_superadmin()
  OR EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.employee_id = auth_employee_id()
      AND e.role = 'hr'
  )
);

DROP POLICY IF EXISTS "Delete employee KPI target versions (superadmin)" ON public.employee_kpi_target_versions;
CREATE POLICY "Delete employee KPI target versions (superadmin)"
ON public.employee_kpi_target_versions FOR DELETE TO authenticated
USING (is_superadmin());
DROP TRIGGER IF EXISTS update_kpi_definition_versions_modtime ON public.kpi_definition_versions;
CREATE TRIGGER update_kpi_definition_versions_modtime
BEFORE UPDATE ON public.kpi_definition_versions
FOR EACH ROW EXECUTE FUNCTION update_modified_column();

DROP TRIGGER IF EXISTS update_employee_kpi_target_versions_modtime ON public.employee_kpi_target_versions;
CREATE TRIGGER update_employee_kpi_target_versions_modtime
BEFORE UPDATE ON public.employee_kpi_target_versions
FOR EACH ROW EXECUTE FUNCTION update_modified_column();

COMMIT;



