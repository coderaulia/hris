-- ==================================================
-- Rollback: HR Document Archive
-- Reverses: 20260507_hr_document_archive.sql
-- ==================================================

BEGIN;

DROP POLICY IF EXISTS "HR archive delete" ON storage.objects;
DROP POLICY IF EXISTS "HR archive read" ON storage.objects;
DROP POLICY IF EXISTS "HR archive upload" ON storage.objects;

DELETE FROM storage.buckets WHERE id = 'hr-document-archive';

DROP POLICY IF EXISTS "Manage HR document archive" ON public.hr_document_archive;
DROP POLICY IF EXISTS "Read HR document archive" ON public.hr_document_archive;

DROP TABLE IF EXISTS public.hr_document_archive;

COMMIT;
