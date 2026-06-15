-- ==================================================
-- Rollback: Live Attendance
-- Date: 2026-06-15
-- Reverses 20260615_live_attendance.sql
-- Note: does NOT delete uploaded selfie objects in the attendance-photos
--       bucket. Empty the bucket manually before dropping it if required.
-- ==================================================

BEGIN;

DROP POLICY IF EXISTS "Attendance photo upload" ON storage.objects;
DROP POLICY IF EXISTS "Attendance photo read" ON storage.objects;
DROP POLICY IF EXISTS "Attendance photo delete" ON storage.objects;

DELETE FROM storage.buckets WHERE id = 'attendance-photos';

DROP VIEW IF EXISTS public.attendance_daily;

DROP POLICY IF EXISTS "Read attendance by scope" ON public.attendance_records;
DROP POLICY IF EXISTS "Insert own attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "HR correct attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "HR delete attendance" ON public.attendance_records;

DROP POLICY IF EXISTS "Read work sites" ON public.attendance_work_sites;
DROP POLICY IF EXISTS "HR manage work sites" ON public.attendance_work_sites;

DROP TABLE IF EXISTS public.attendance_records;
DROP TABLE IF EXISTS public.attendance_work_sites;

COMMIT;
