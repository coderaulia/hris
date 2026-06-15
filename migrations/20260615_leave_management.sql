-- ==================================================
-- Leave Management (Cuti & Izin)
-- Date: 2026-06-15
-- Purpose:
-- - leave_types        : Indonesian leave type catalog (seeded)
-- - leave_balances     : per employee per type per year balance tracking
-- - leave_requests     : one row per request with approval lifecycle
-- - leave_balance_overview view
-- - apply_leave_balance_delta RPC (atomic used_days update)
-- - leave-attachments  : private Supabase Storage bucket for sick notes
-- - RLS: employee self-service; manager team approve; HR/superadmin all
-- Safe to re-run
-- ==================================================

BEGIN;

-- --------------------------------------------------
-- Leave types catalog
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leave_types (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                 TEXT NOT NULL UNIQUE,
  name_id              TEXT NOT NULL,
  name_en              TEXT NOT NULL,
  is_paid              BOOLEAN NOT NULL DEFAULT TRUE,
  default_quota_days   INTEGER,           -- NULL = unlimited (e.g. sakit)
  requires_attachment  BOOLEAN NOT NULL DEFAULT FALSE,
  active               BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.leave_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read leave types"   ON public.leave_types;
DROP POLICY IF EXISTS "HR manage leave types" ON public.leave_types;

CREATE POLICY "Read leave types"
ON public.leave_types FOR SELECT TO authenticated
USING (TRUE);

CREATE POLICY "HR manage leave types"
ON public.leave_types FOR ALL TO authenticated
USING (is_superadmin() OR is_hr_user())
WITH CHECK (is_superadmin() OR is_hr_user());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leave_types TO authenticated;

-- Seed the four Indonesian leave types (idempotent)
INSERT INTO public.leave_types (code, name_id, name_en, is_paid, default_quota_days, requires_attachment, active)
VALUES
  ('cuti_tahunan', 'Cuti Tahunan',  'Annual Leave',   TRUE,  12,   FALSE, TRUE),
  ('cuti_spesial', 'Cuti Spesial',  'Special Leave',  TRUE,  NULL, TRUE,  TRUE),
  ('izin',         'Izin',           'Permission',     FALSE, NULL, FALSE, TRUE),
  ('sakit',        'Sakit',          'Sick Leave',     TRUE,  NULL, TRUE,  TRUE)
ON CONFLICT (code) DO NOTHING;

-- --------------------------------------------------
-- Leave balances (per employee per type per year)
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leave_balances (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id       TEXT NOT NULL,
  leave_type_id     UUID NOT NULL REFERENCES public.leave_types (id) ON DELETE CASCADE,
  year              INTEGER NOT NULL,
  entitled_days     INTEGER NOT NULL DEFAULT 0,
  used_days         INTEGER NOT NULL DEFAULT 0 CHECK (used_days >= 0),
  carried_over_days INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, leave_type_id, year)
);

CREATE INDEX IF NOT EXISTS idx_leave_balances_employee
  ON public.leave_balances (employee_id);

CREATE INDEX IF NOT EXISTS idx_leave_balances_year
  ON public.leave_balances (employee_id, year);

ALTER TABLE public.leave_balances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Employee read own balances" ON public.leave_balances;
DROP POLICY IF EXISTS "HR manage balances"          ON public.leave_balances;

CREATE POLICY "Employee read own balances"
ON public.leave_balances FOR SELECT TO authenticated
USING (employee_id = auth_employee_id());

CREATE POLICY "HR manage balances"
ON public.leave_balances FOR ALL TO authenticated
USING (is_superadmin() OR is_hr_user())
WITH CHECK (is_superadmin() OR is_hr_user());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leave_balances TO authenticated;

-- --------------------------------------------------
-- Leave requests
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leave_requests (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id             TEXT NOT NULL,
  leave_type_id           UUID NOT NULL REFERENCES public.leave_types (id) ON DELETE RESTRICT,
  start_date              DATE NOT NULL,
  end_date                DATE NOT NULL CHECK (end_date >= start_date),
  days_count              INTEGER NOT NULL CHECK (days_count > 0),
  half_day                BOOLEAN NOT NULL DEFAULT FALSE,
  reason                  TEXT,
  attachment_storage_path TEXT,
  status                  TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  approver_id             TEXT,
  decided_at              TIMESTAMPTZ,
  decision_note           TEXT,
  created_by              TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leave_requests_employee
  ON public.leave_requests (employee_id);

CREATE INDEX IF NOT EXISTS idx_leave_requests_status
  ON public.leave_requests (status);

CREATE INDEX IF NOT EXISTS idx_leave_requests_dates
  ON public.leave_requests (start_date, end_date);

ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Employee read own leave"     ON public.leave_requests;
DROP POLICY IF EXISTS "Employee insert own leave"   ON public.leave_requests;
DROP POLICY IF EXISTS "Employee cancel own leave"   ON public.leave_requests;
DROP POLICY IF EXISTS "Manager read team leave"     ON public.leave_requests;
DROP POLICY IF EXISTS "Manager decide team leave"   ON public.leave_requests;
DROP POLICY IF EXISTS "HR manage all leave"         ON public.leave_requests;

-- Employee reads own
CREATE POLICY "Employee read own leave"
ON public.leave_requests FOR SELECT TO authenticated
USING (
  is_superadmin()
  OR is_hr_user()
  OR employee_id = auth_employee_id()
  OR EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.employee_id = leave_requests.employee_id
      AND (
        e.manager_id = auth_employee_id()
        OR (is_manager() AND e.department = auth_department())
      )
  )
);

-- Employee submits own
CREATE POLICY "Employee insert own leave"
ON public.leave_requests FOR INSERT TO authenticated
WITH CHECK (
  is_superadmin()
  OR is_hr_user()
  OR employee_id = auth_employee_id()
);

-- Employee cancels own pending request only
CREATE POLICY "Employee cancel own leave"
ON public.leave_requests FOR UPDATE TO authenticated
USING (employee_id = auth_employee_id() AND status = 'pending')
WITH CHECK (employee_id = auth_employee_id() AND status = 'cancelled');

-- Manager approves/rejects their team
CREATE POLICY "Manager decide team leave"
ON public.leave_requests FOR UPDATE TO authenticated
USING (
  is_superadmin()
  OR is_hr_user()
  OR (
    is_manager()
    AND EXISTS (
      SELECT 1
      FROM public.employees e
      WHERE e.employee_id = leave_requests.employee_id
        AND (
          e.manager_id = auth_employee_id()
          OR e.department = auth_department()
        )
    )
  )
)
WITH CHECK (
  is_superadmin()
  OR is_hr_user()
  OR is_manager()
);

-- HR/superadmin delete (e.g. data cleanup)
CREATE POLICY "HR delete leave"
ON public.leave_requests FOR DELETE TO authenticated
USING (is_superadmin() OR is_hr_user());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leave_requests TO authenticated;

-- --------------------------------------------------
-- Balance overview view
-- --------------------------------------------------
DROP VIEW IF EXISTS public.leave_balance_overview;

CREATE VIEW public.leave_balance_overview
WITH (security_invoker = true)
AS
SELECT
  lb.id,
  lb.employee_id,
  lb.leave_type_id,
  lt.code        AS leave_type_code,
  lt.name_id     AS leave_type_name,
  lt.is_paid,
  lb.year,
  lb.entitled_days,
  lb.used_days,
  lb.carried_over_days,
  (lb.entitled_days + COALESCE(lb.carried_over_days, 0))          AS total_entitled,
  GREATEST(0, lb.entitled_days + COALESCE(lb.carried_over_days, 0) - lb.used_days) AS remaining_days
FROM public.leave_balances lb
JOIN public.leave_types lt ON lt.id = lb.leave_type_id;

GRANT SELECT ON public.leave_balance_overview TO authenticated;

-- --------------------------------------------------
-- Atomic balance delta RPC
-- Called on approve (delta = +days_count) and on rejection of already-
-- approved request (delta = -days_count). SECURITY DEFINER so the
-- function can write leave_balances regardless of the caller's row
-- ownership; the body enforces manager/HR/superadmin role.
-- --------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_leave_balance_delta(
  p_employee_id   TEXT,
  p_leave_type_id UUID,
  p_year          INTEGER,
  p_delta         INTEGER
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (is_superadmin() OR is_hr_user() OR is_manager()) THEN
    RAISE EXCEPTION 'Access denied: insufficient role';
  END IF;

  INSERT INTO public.leave_balances
    (employee_id, leave_type_id, year, used_days, entitled_days, carried_over_days)
  VALUES (
    p_employee_id,
    p_leave_type_id,
    p_year,
    GREATEST(0, p_delta),
    COALESCE((SELECT default_quota_days FROM public.leave_types WHERE id = p_leave_type_id), 0),
    0
  )
  ON CONFLICT (employee_id, leave_type_id, year) DO UPDATE
    SET used_days  = GREATEST(0, leave_balances.used_days + p_delta),
        updated_at = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_leave_balance_delta TO authenticated;

-- --------------------------------------------------
-- Storage bucket for leave attachments (sick notes, etc.)
-- Path: {employee_id}/{request_id}/{original_filename}
-- --------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'leave-attachments',
  'leave-attachments',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Leave attachment upload"  ON storage.objects;
DROP POLICY IF EXISTS "Leave attachment read"    ON storage.objects;
DROP POLICY IF EXISTS "Leave attachment delete"  ON storage.objects;

CREATE POLICY "Leave attachment upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'leave-attachments'
  AND (
    is_superadmin()
    OR is_hr_user()
    OR (storage.foldername(name))[1] = auth_employee_id()
  )
);

CREATE POLICY "Leave attachment read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'leave-attachments'
  AND (
    is_superadmin()
    OR is_hr_user()
    OR (storage.foldername(name))[1] = auth_employee_id()
  )
);

CREATE POLICY "Leave attachment delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'leave-attachments'
  AND (is_superadmin() OR is_hr_user())
);

COMMIT;
