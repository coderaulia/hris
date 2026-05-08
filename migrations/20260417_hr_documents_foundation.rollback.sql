-- ==================================================
-- Rollback: HR Documents Foundation
-- Reverses: 20260417_hr_documents_foundation.sql
-- Run as part of the rollback chain in reverse migration order.
-- ==================================================

BEGIN;

REVOKE SELECT, INSERT, UPDATE, DELETE ON public.hr_document_reference_options FROM authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.hr_document_templates FROM authenticated;

DROP POLICY IF EXISTS "Manage HR document reference options" ON public.hr_document_reference_options;
DROP POLICY IF EXISTS "Read HR document reference options" ON public.hr_document_reference_options;
DROP POLICY IF EXISTS "Manage HR document templates" ON public.hr_document_templates;
DROP POLICY IF EXISTS "Read HR document templates" ON public.hr_document_templates;

DROP TABLE IF EXISTS public.hr_document_reference_options;
DROP TABLE IF EXISTS public.hr_document_templates;

DELETE FROM public.app_settings
WHERE key IN (
  'document_logo_url',
  'document_default_watermark',
  'document_footer_text'
);

ALTER TABLE public.employees
  DROP COLUMN IF EXISTS active_sp_reason,
  DROP COLUMN IF EXISTS active_sp_until,
  DROP COLUMN IF EXISTS active_sp_level,
  DROP COLUMN IF EXISTS signature_image_url,
  DROP COLUMN IF EXISTS job_level,
  DROP COLUMN IF EXISTS nik_number,
  DROP COLUMN IF EXISTS address,
  DROP COLUMN IF EXISTS date_of_birth,
  DROP COLUMN IF EXISTS place_of_birth,
  DROP COLUMN IF EXISTS legal_name;

COMMIT;
