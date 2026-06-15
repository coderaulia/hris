-- ==================================================
-- Attendance geofence server-side enforcement
-- Date: 2026-06-15
-- Purpose:
-- Remove client-side trust for within_geofence by recomputing it in a
-- BEFORE INSERT trigger on attendance_records. The trigger loads all
-- active work sites, runs Haversine distance in PL/pgSQL, and overwrites
-- whatever the client sent. Employees can no longer spoof within_geofence.
-- If no work sites are configured, NULL is stored (same as before).
-- Safe to re-run (CREATE OR REPLACE).
-- ==================================================

BEGIN;

-- Haversine distance helper (returns metres).
CREATE OR REPLACE FUNCTION public.attendance_haversine_m(
    lat1 DOUBLE PRECISION,
    lon1 DOUBLE PRECISION,
    lat2 DOUBLE PRECISION,
    lon2 DOUBLE PRECISION
)
RETURNS DOUBLE PRECISION
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
AS $$
DECLARE
    r  DOUBLE PRECISION := 6371000;
    d_lat DOUBLE PRECISION := radians(lat2 - lat1);
    d_lon DOUBLE PRECISION := radians(lon2 - lon1);
    a  DOUBLE PRECISION;
BEGIN
    a := sin(d_lat / 2) ^ 2
       + cos(radians(lat1)) * cos(radians(lat2)) * sin(d_lon / 2) ^ 2;
    RETURN 2 * r * asin(LEAST(1, sqrt(a)));
END;
$$;

-- Trigger function: recompute within_geofence + work_site_id before insert.
CREATE OR REPLACE FUNCTION public.attendance_set_geofence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    site_count INTEGER;
    best_site_id UUID := NULL;
    best_dist    DOUBLE PRECISION := NULL;
    cur_dist     DOUBLE PRECISION;
    rec          RECORD;
BEGIN
    -- Count active sites; if none exist, NULL means "no geofence configured".
    SELECT COUNT(*) INTO site_count
    FROM public.attendance_work_sites
    WHERE active = TRUE;

    IF site_count = 0 OR NEW.latitude IS NULL OR NEW.longitude IS NULL THEN
        NEW.within_geofence := NULL;
        NEW.work_site_id    := NULL;
        RETURN NEW;
    END IF;

    -- Find the nearest active site within its radius.
    FOR rec IN
        SELECT id, latitude, longitude, radius_m
        FROM public.attendance_work_sites
        WHERE active = TRUE
    LOOP
        cur_dist := public.attendance_haversine_m(
            NEW.latitude, NEW.longitude,
            rec.latitude, rec.longitude
        );
        IF cur_dist <= rec.radius_m AND (best_dist IS NULL OR cur_dist < best_dist) THEN
            best_site_id := rec.id;
            best_dist    := cur_dist;
        END IF;
    END LOOP;

    NEW.within_geofence := best_site_id IS NOT NULL;
    NEW.work_site_id    := best_site_id;
    RETURN NEW;
END;
$$;

-- Attach trigger (fires before every INSERT; replaces client values).
DROP TRIGGER IF EXISTS trg_attendance_set_geofence ON public.attendance_records;

CREATE TRIGGER trg_attendance_set_geofence
BEFORE INSERT ON public.attendance_records
FOR EACH ROW EXECUTE FUNCTION public.attendance_set_geofence();

COMMIT;
