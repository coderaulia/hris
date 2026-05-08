-- ==================================================
-- HR Document Archive
-- Date: 2026-05-07
-- Purpose:
-- - create hr_document_archive table for persisted generated PDFs
-- - create Supabase Storage bucket hr-document-archive
-- - grant and secure with RLS for HR/superadmin workflows
-- Safe to re-run
-- ==================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.hr_document_archive (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id TEXT NOT NULL,
  document_type TEXT NOT NULL,
  filename TEXT NOT NULL,
  storage_path TEXT,
  generated_by TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hr_document_archive_employee_id
  ON public.hr_document_archive (employee_id);

CREATE INDEX IF NOT EXISTS idx_hr_document_archive_generated_at
  ON public.hr_document_archive (generated_at DESC);

ALTER TABLE public.hr_document_archive ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read HR document archive" ON public.hr_document_archive;
DROP POLICY IF EXISTS "Manage HR document archive" ON public.hr_document_archive;

CREATE POLICY "Read HR document archive"
ON public.hr_document_archive FOR SELECT TO authenticated
USING (is_superadmin() OR is_hr_user());

CREATE POLICY "Manage HR document archive"
ON public.hr_document_archive FOR ALL TO authenticated
USING (is_superadmin() OR is_hr_user())
WITH CHECK (is_superadmin() OR is_hr_user());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_document_archive TO authenticated;

-- Storage bucket for generated PDFs (10 MB limit, PDF only)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'hr-document-archive',
  'hr-document-archive',
  false,
  10485760,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "HR archive upload" ON storage.objects;
DROP POLICY IF EXISTS "HR archive read" ON storage.objects;
DROP POLICY IF EXISTS "HR archive delete" ON storage.objects;

CREATE POLICY "HR archive upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'hr-document-archive'
  AND (is_superadmin() OR is_hr_user())
);

CREATE POLICY "HR archive read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'hr-document-archive'
  AND (is_superadmin() OR is_hr_user())
);

CREATE POLICY "HR archive delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'hr-document-archive'
  AND (is_superadmin() OR is_hr_user())
);

COMMIT;
