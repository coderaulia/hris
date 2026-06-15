-- ==================================================
-- Live Attendance (GPS + Selfie Clock In/Out)
-- Date: 2026-06-15
-- Purpose:
-- - create attendance_work_sites (optional geofence anchors)
-- - create attendance_records (one immutable row per clock event with
--   geolocation + selfie proof)
-- - create attendance_daily view (per employee per day summary)
-- - create private Supabase Storage bucket attendance-photos for selfies
-- - secure with RLS: employee self-insert/read, manager team read,
--   HR/superadmin read all + correct, mirroring kpi_records scope and the
--   document-signatures storage pattern
-- Safe to re-run
-- ==================================================

BEGIN;

-- --------------------------------------------------
-- Work sites (optional geofence anchors)
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.attendance_work_sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  radius_m INTEGER NOT NULL DEFAULT 150 CHECK (radius_m > 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendance_work_sites_active
  ON public.attendance_work_sites (active);

ALTER TABLE public.attendance_work_sites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read work sites" ON public.attendance_work_sites;
DROP POLICY IF EXISTS "HR manage work sites" ON public.attendance_work_sites;

-- Any authenticated user reads active sites (mobile app geofence check)
CREATE POLICY "Read work sites"
ON public.attendance_work_sites FOR SELECT TO authenticated
USING (TRUE);

-- Only HR/superadmin create, update, delete work sites
CREATE POLICY "HR manage work sites"
ON public.attendance_work_sites FOR ALL TO authenticated
USING (is_superadmin() OR is_hr_user())
WITH CHECK (is_superadmin() OR is_hr_user());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_work_sites TO authenticated;

-- --------------------------------------------------
-- Attendance records (one immutable row per punch)
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('clock_in', 'clock_out')),
  event_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  accuracy_m DOUBLE PRECISION,
  address TEXT,
  photo_storage_path TEXT,
  work_site_id UUID REFERENCES public.attendance_work_sites (id) ON DELETE SET NULL,
  within_geofence BOOLEAN,
  device_info JSONB,
  note TEXT,
  corrected_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendance_records_employee
  ON public.attendance_records (employee_id);

CREATE INDEX IF NOT EXISTS idx_attendance_records_event_time
  ON public.attendance_records (event_time);

CREATE INDEX IF NOT EXISTS idx_attendance_records_employee_time
  ON public.attendance_records (employee_id, event_time);

ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read attendance by scope" ON public.attendance_records;
DROP POLICY IF EXISTS "Insert own attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "HR correct attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "HR delete attendance" ON public.attendance_records;

-- Employee reads own; manager reads team; HR/superadmin read all
CREATE POLICY "Read attendance by scope"
ON public.attendance_records FOR SELECT TO authenticated
USING (
  is_superadmin()
  OR is_hr_user()
  OR employee_id = auth_employee_id()
  OR EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.employee_id = attendance_records.employee_id
      AND (
        e.manager_id = auth_employee_id()
        OR (is_manager() AND e.department = auth_department())
      )
  )
);

-- Employee may only insert their own punches (HR/superadmin may insert too)
CREATE POLICY "Insert own attendance"
ON public.attendance_records FOR INSERT TO authenticated
WITH CHECK (
  is_superadmin()
  OR is_hr_user()
  OR employee_id = auth_employee_id()
);

-- Punches are immutable for employees; only HR/superadmin may correct
CREATE POLICY "HR correct attendance"
ON public.attendance_records FOR UPDATE TO authenticated
USING (is_superadmin() OR is_hr_user())
WITH CHECK (is_superadmin() OR is_hr_user());

-- Only HR/superadmin delete
CREATE POLICY "HR delete attendance"
ON public.attendance_records FOR DELETE TO authenticated
USING (is_superadmin() OR is_hr_user());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_records TO authenticated;

-- --------------------------------------------------
-- Daily summary view (per employee per day)
-- Security-invoker so base-table RLS on attendance_records applies.
-- --------------------------------------------------
DROP VIEW IF EXISTS public.attendance_daily;

CREATE VIEW public.attendance_daily
WITH (security_invoker = true)
AS
SELECT
  employee_id,
  (event_time AT TIME ZONE 'Asia/Jakarta')::date AS work_date,
  MIN(event_time) FILTER (WHERE event_type = 'clock_in')  AS first_clock_in,
  MAX(event_time) FILTER (WHERE event_type = 'clock_out')  AS last_clock_out,
  COUNT(*) AS punch_count,
  ROUND(
    EXTRACT(EPOCH FROM (
      MAX(event_time) FILTER (WHERE event_type = 'clock_out')
      - MIN(event_time) FILTER (WHERE event_type = 'clock_in')
    )) / 60.0
  )::INTEGER AS worked_minutes
FROM public.attendance_records
GROUP BY employee_id, (event_time AT TIME ZONE 'Asia/Jakarta')::date;

GRANT SELECT ON public.attendance_daily TO authenticated;

-- --------------------------------------------------
-- Storage bucket for selfies (2 MB limit, JPEG/PNG)
-- Path convention: {employee_id}/{YYYY-MM-DD}/{record_id}.jpg
-- --------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'attendance-photos',
  'attendance-photos',
  false,
  2097152,
  ARRAY['image/jpeg', 'image/png']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Attendance photo upload" ON storage.objects;
DROP POLICY IF EXISTS "Attendance photo read" ON storage.objects;
DROP POLICY IF EXISTS "Attendance photo delete" ON storage.objects;

-- Employee may upload within own folder; HR/superadmin anywhere
CREATE POLICY "Attendance photo upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'attendance-photos'
  AND (
    is_superadmin()
    OR is_hr_user()
    OR (storage.foldername(name))[1] = auth_employee_id()
  )
);

-- Employee reads own folder; HR/superadmin read all
CREATE POLICY "Attendance photo read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'attendance-photos'
  AND (
    is_superadmin()
    OR is_hr_user()
    OR (storage.foldername(name))[1] = auth_employee_id()
  )
);

-- Only HR/superadmin delete photos
CREATE POLICY "Attendance photo delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'attendance-photos'
  AND (is_superadmin() OR is_hr_user())
);

COMMIT;
