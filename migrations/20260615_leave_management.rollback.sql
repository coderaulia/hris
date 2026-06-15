-- Rollback: remove Leave Management schema
-- WARNING: destroys all leave_requests, leave_balances, and leave_types data.

BEGIN;

-- Storage policies
DROP POLICY IF EXISTS "Leave attachment upload"  ON storage.objects;
DROP POLICY IF EXISTS "Leave attachment read"    ON storage.objects;
DROP POLICY IF EXISTS "Leave attachment delete"  ON storage.objects;

-- Bucket (rows only; actual objects must be deleted manually via Supabase Dashboard)
DELETE FROM storage.buckets WHERE id = 'leave-attachments';

-- RPC
DROP FUNCTION IF EXISTS public.apply_leave_balance_delta(TEXT, UUID, INTEGER, INTEGER);

-- View
DROP VIEW IF EXISTS public.leave_balance_overview;

-- Tables (FK order: requests → balances → types)
DROP TABLE IF EXISTS public.leave_requests;
DROP TABLE IF EXISTS public.leave_balances;
DROP TABLE IF EXISTS public.leave_types;

COMMIT;
