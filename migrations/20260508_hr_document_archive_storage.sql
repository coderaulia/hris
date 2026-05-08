-- ==================================================
-- HR document archive private Storage bucket
-- Date: 2026-05-08
-- Purpose:
-- - create private Supabase Storage bucket for archived HR document PDFs
-- - allow HR/superadmin users to upload and manage archived document files
-- - allow scoped reads for archive subjects through hr_document_archives
-- Safe to re-run
-- ==================================================

BEGIN;

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'hr-document-archives',
  'hr-document-archives',
  FALSE,
  20971520,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Read HR document archive files" ON storage.objects;
DROP POLICY IF EXISTS "Manage HR document archive files" ON storage.objects;

CREATE POLICY "Read HR document archive files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'hr-document-archives'
  AND (
    is_superadmin()
    OR is_hr_user()
    OR EXISTS (
      SELECT 1
      FROM public.hr_document_archives archive
      WHERE archive.storage_path = storage.objects.name
        AND archive.employee_id IS NOT NULL
        AND can_access_employee(archive.employee_id)
    )
  )
);

CREATE POLICY "Manage HR document archive files"
ON storage.objects FOR ALL TO authenticated
USING (
  bucket_id = 'hr-document-archives'
  AND (is_superadmin() OR is_hr_user())
)
WITH CHECK (
  bucket_id = 'hr-document-archives'
  AND (is_superadmin() OR is_hr_user())
);

COMMIT;
