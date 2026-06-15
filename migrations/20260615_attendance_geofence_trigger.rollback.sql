-- Rollback: remove server-side geofence enforcement
-- WARNING: after rollback, within_geofence is once again client-supplied.

BEGIN;

DROP TRIGGER IF EXISTS trg_attendance_set_geofence ON public.attendance_records;
DROP FUNCTION IF EXISTS public.attendance_set_geofence();
DROP FUNCTION IF EXISTS public.attendance_haversine_m(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION);

COMMIT;
