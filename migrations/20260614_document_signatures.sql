-- ==================================================
-- Document Signature Requests (E-Signature Workflow)
-- Date: 2026-06-14
-- Purpose:
-- - create document_signature_requests table linking archived HR
--   documents to signers with pending/signed/declined status
-- - create private Supabase Storage bucket document-signatures for
--   uploaded signature images
-- - secure both with RLS: HR/superadmin manage all, signer self-access
--   to own request via auth_employee_id()
-- Safe to re-run
-- ==================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.document_signature_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  archive_id UUID NOT NULL REFERENCES public.hr_document_archive (id) ON DELETE CASCADE,
  signer_employee_id TEXT NOT NULL,
  signer_role TEXT NOT NULL DEFAULT 'employee'
    CHECK (signer_role IN ('employee', 'manager', 'hr')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'signed', 'declined')),
  signature_type TEXT
    CHECK (signature_type IS NULL OR signature_type IN ('uploaded')),
  signature_storage_path TEXT,
  -- Denormalized document context so a signer can see what they are signing
  -- without read access to the HR-only hr_document_archive table.
  document_filename TEXT,
  document_type TEXT,
  employee_name TEXT,
  archive_storage_path TEXT,
  signed_at TIMESTAMPTZ,
  decline_reason TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_signature_requests_archive_id
  ON public.document_signature_requests (archive_id);

CREATE INDEX IF NOT EXISTS idx_document_signature_requests_signer
  ON public.document_signature_requests (signer_employee_id);

CREATE INDEX IF NOT EXISTS idx_document_signature_requests_status
  ON public.document_signature_requests (status);

ALTER TABLE public.document_signature_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read signature requests" ON public.document_signature_requests;
DROP POLICY IF EXISTS "Create signature requests" ON public.document_signature_requests;
DROP POLICY IF EXISTS "HR update signature requests" ON public.document_signature_requests;
DROP POLICY IF EXISTS "Signer update own signature request" ON public.document_signature_requests;
DROP POLICY IF EXISTS "HR delete signature requests" ON public.document_signature_requests;

-- HR/superadmin read all; signer reads own requests
CREATE POLICY "Read signature requests"
ON public.document_signature_requests FOR SELECT TO authenticated
USING (
  is_superadmin()
  OR is_hr_user()
  OR signer_employee_id = auth_employee_id()
);

-- Only HR/superadmin create signature requests
CREATE POLICY "Create signature requests"
ON public.document_signature_requests FOR INSERT TO authenticated
WITH CHECK (is_superadmin() OR is_hr_user());

-- HR/superadmin may update any signature request
CREATE POLICY "HR update signature requests"
ON public.document_signature_requests FOR UPDATE TO authenticated
USING (is_superadmin() OR is_hr_user())
WITH CHECK (is_superadmin() OR is_hr_user());

-- Signer may act on own request only while still pending
CREATE POLICY "Signer update own signature request"
ON public.document_signature_requests FOR UPDATE TO authenticated
USING (
  signer_employee_id = auth_employee_id()
  AND status = 'pending'
)
WITH CHECK (
  signer_employee_id = auth_employee_id()
  AND status IN ('signed', 'declined')
);

-- Only HR/superadmin delete signature requests
CREATE POLICY "HR delete signature requests"
ON public.document_signature_requests FOR DELETE TO authenticated
USING (is_superadmin() OR is_hr_user());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_signature_requests TO authenticated;

-- Lets a signer read exactly the archived PDF they were asked to sign, without
-- broad access to the HR-only hr_document_archive bucket. SECURITY DEFINER so the
-- lookup is not blocked by the requests table's own RLS.
CREATE OR REPLACE FUNCTION public.can_read_signature_archive_object(object_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.document_signature_requests r
    WHERE r.archive_storage_path = object_name
      AND r.signer_employee_id = auth_employee_id()
  );
$$;

-- Storage bucket for uploaded signature images (2 MB limit, PNG/JPEG)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'document-signatures',
  'document-signatures',
  false,
  2097152,
  ARRAY['image/png', 'image/jpeg']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Signature image upload" ON storage.objects;
DROP POLICY IF EXISTS "Signature image read" ON storage.objects;
DROP POLICY IF EXISTS "Signature image delete" ON storage.objects;

-- Path convention: {signer_employee_id}/{request_id}.png
-- Signer may upload/read within their own folder; HR/superadmin anywhere
CREATE POLICY "Signature image upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'document-signatures'
  AND (
    is_superadmin()
    OR is_hr_user()
    OR (storage.foldername(name))[1] = auth_employee_id()
  )
);

CREATE POLICY "Signature image read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'document-signatures'
  AND (
    is_superadmin()
    OR is_hr_user()
    OR (storage.foldername(name))[1] = auth_employee_id()
  )
);

CREATE POLICY "Signature image delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'document-signatures'
  AND (is_superadmin() OR is_hr_user())
);

-- Allow a signer to read the specific archived PDF tied to their signature request
DROP POLICY IF EXISTS "Signer read assigned archive document" ON storage.objects;

CREATE POLICY "Signer read assigned archive document"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'hr-document-archive'
  AND can_read_signature_archive_object(name)
);

COMMIT;
