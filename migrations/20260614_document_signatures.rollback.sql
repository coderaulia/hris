-- ==================================================
-- Rollback: Document Signature Requests
-- Reverses: 20260614_document_signatures.sql
-- ==================================================

BEGIN;

DROP POLICY IF EXISTS "Signer read assigned archive document" ON storage.objects;
DROP POLICY IF EXISTS "Signature image delete" ON storage.objects;
DROP POLICY IF EXISTS "Signature image read" ON storage.objects;
DROP POLICY IF EXISTS "Signature image upload" ON storage.objects;

DELETE FROM storage.buckets WHERE id = 'document-signatures';

DROP POLICY IF EXISTS "HR delete signature requests" ON public.document_signature_requests;
DROP POLICY IF EXISTS "Signer update own signature request" ON public.document_signature_requests;
DROP POLICY IF EXISTS "HR update signature requests" ON public.document_signature_requests;
DROP POLICY IF EXISTS "Create signature requests" ON public.document_signature_requests;
DROP POLICY IF EXISTS "Read signature requests" ON public.document_signature_requests;

DROP FUNCTION IF EXISTS public.can_read_signature_archive_object(TEXT);

DROP TABLE IF EXISTS public.document_signature_requests;

COMMIT;
