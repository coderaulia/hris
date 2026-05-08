-- ==================================================
-- HR document archives and signature state
-- Date: 2026-05-08
-- Purpose:
-- - persist generated HR document archive metadata
-- - track company/recipient signature workflow status
-- - reserve storage path metadata for later private bucket upload
-- Safe to re-run
-- ==================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.hr_document_archives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type TEXT NOT NULL,
  employee_id TEXT REFERENCES public.employees(employee_id) ON DELETE SET NULL,
  subject_name TEXT NOT NULL,
  subject_mode TEXT NOT NULL DEFAULT 'employee',
  template_id UUID REFERENCES public.hr_document_templates(id) ON DELETE SET NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/pdf',
  file_size_bytes INTEGER NOT NULL DEFAULT 0,
  storage_status TEXT NOT NULL DEFAULT 'metadata_only'
    CHECK (storage_status IN ('metadata_only', 'stored')),
  storage_path TEXT,
  generated_by TEXT REFERENCES public.employees(employee_id) ON DELETE SET NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  signer_id TEXT REFERENCES public.employees(employee_id) ON DELETE SET NULL,
  signer_title TEXT,
  recipient_signer_id TEXT REFERENCES public.employees(employee_id) ON DELETE SET NULL,
  requires_recipient_signature BOOLEAN NOT NULL DEFAULT FALSE,
  signature_status TEXT NOT NULL DEFAULT 'pending_signature'
    CHECK (signature_status IN ('generated', 'pending_signature', 'signed', 'rejected')),
  signature_note TEXT,
  company_signed_at TIMESTAMPTZ,
  recipient_signed_at TIMESTAMPTZ,
  document_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hr_document_archives_employee
  ON public.hr_document_archives (employee_id, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_hr_document_archives_status
  ON public.hr_document_archives (signature_status, generated_at DESC);

ALTER TABLE public.hr_document_archives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read HR document archives" ON public.hr_document_archives;
DROP POLICY IF EXISTS "Manage HR document archives" ON public.hr_document_archives;
DROP POLICY IF EXISTS "Employee read own HR document archives" ON public.hr_document_archives;
CREATE POLICY "Read HR document archives"
ON public.hr_document_archives FOR SELECT TO authenticated
USING (is_superadmin() OR is_hr_user());
CREATE POLICY "Employee read own HR document archives"
ON public.hr_document_archives FOR SELECT TO authenticated
USING (employee_id IS NOT NULL AND can_access_employee(employee_id));
CREATE POLICY "Manage HR document archives"
ON public.hr_document_archives FOR ALL TO authenticated
USING (is_superadmin() OR is_hr_user())
WITH CHECK (is_superadmin() OR is_hr_user());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_document_archives TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_modified_column')
     AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_hr_document_archives_modtime') THEN
    CREATE TRIGGER update_hr_document_archives_modtime
    BEFORE UPDATE ON public.hr_document_archives
    FOR EACH ROW EXECUTE FUNCTION update_modified_column();
  END IF;
END $$;

COMMIT;
