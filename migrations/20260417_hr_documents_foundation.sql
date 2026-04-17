-- ==================================================
-- HR Documents foundation
-- Date: 2026-04-17
-- Purpose:
-- - add legal-identity and document-signature fields to employees
-- - add document branding settings
-- - create editable HR document template and reference-option tables
-- - grant and secure new tables for HR/superadmin document workflows
-- Safe to re-run
-- ==================================================

BEGIN;

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS legal_name TEXT,
  ADD COLUMN IF NOT EXISTS place_of_birth TEXT,
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS nik_number TEXT,
  ADD COLUMN IF NOT EXISTS job_level TEXT,
  ADD COLUMN IF NOT EXISTS signature_image_url TEXT,
  ADD COLUMN IF NOT EXISTS active_sp_level TEXT,
  ADD COLUMN IF NOT EXISTS active_sp_until DATE,
  ADD COLUMN IF NOT EXISTS active_sp_reason TEXT;

INSERT INTO public.app_settings (key, value)
VALUES
  ('document_logo_url', ''),
  ('document_default_watermark', 'Confidential'),
  ('document_footer_text', '')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.hr_document_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'id-ID',
  contract_type TEXT,
  template_name TEXT NOT NULL,
  template_status TEXT NOT NULL DEFAULT 'active',
  version_no INTEGER NOT NULL DEFAULT 1,
  header_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  body_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  body_markup TEXT NOT NULL DEFAULT '',
  signature_config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  field_schema_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.hr_document_reference_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_key TEXT NOT NULL,
  option_key TEXT NOT NULL,
  option_label TEXT NOT NULL,
  option_value TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_document_templates_identity
  ON public.hr_document_templates (document_type, locale, COALESCE(contract_type, ''), version_no);

CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_document_reference_options_identity
  ON public.hr_document_reference_options (group_key, option_key);

ALTER TABLE public.hr_document_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_document_reference_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read HR document templates" ON public.hr_document_templates;
DROP POLICY IF EXISTS "Manage HR document templates" ON public.hr_document_templates;
CREATE POLICY "Read HR document templates"
ON public.hr_document_templates FOR SELECT TO authenticated
USING (is_superadmin() OR is_hr_user());
CREATE POLICY "Manage HR document templates"
ON public.hr_document_templates FOR ALL TO authenticated
USING (is_superadmin() OR is_hr_user())
WITH CHECK (is_superadmin() OR is_hr_user());

DROP POLICY IF EXISTS "Read HR document reference options" ON public.hr_document_reference_options;
DROP POLICY IF EXISTS "Manage HR document reference options" ON public.hr_document_reference_options;
CREATE POLICY "Read HR document reference options"
ON public.hr_document_reference_options FOR SELECT TO authenticated
USING (is_superadmin() OR is_hr_user());
CREATE POLICY "Manage HR document reference options"
ON public.hr_document_reference_options FOR ALL TO authenticated
USING (is_superadmin() OR is_hr_user())
WITH CHECK (is_superadmin() OR is_hr_user());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_document_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_document_reference_options TO authenticated;

INSERT INTO public.hr_document_templates (
  document_type,
  locale,
  contract_type,
  template_name,
  template_status,
  version_no,
  header_json,
  body_json,
  body_markup,
  signature_config_json,
  field_schema_json,
  is_default
)
SELECT *
FROM (
  VALUES
    (
      'offer_letter',
      'id-ID',
      NULL,
      'Offer Letter Indonesia',
      'active',
      1,
      '{"show_logo":true,"title":"Surat Penawaran Kerja"}'::jsonb,
      '[
        {"type":"paragraph","text":"Dengan hormat, bersama surat ini {{company_name}} menyampaikan penawaran kerja kepada {{employee_name}} untuk posisi {{job_title}}."},
        {"type":"paragraph","text":"Jenis hubungan kerja: {{contract_type}}. Nomor surat: {{nomor_surat}}."},
        {"type":"paragraph","text":"Fasilitas dan benefit akan mengikuti rincian yang disepakati dalam lampiran/penawaran ini."}
      ]'::jsonb,
      '',
      '{"company_signer_required":true,"employee_signer_required":true}'::jsonb,
      '[
        {"key":"nomor_surat","label":"Nomor Surat","type":"text","required":true},
        {"key":"contract_type","label":"Jenis Kontrak","type":"select","required":true},
        {"key":"benefits","label":"Benefits","type":"repeater","required":false}
      ]'::jsonb,
      TRUE
    ),
    (
      'employment_contract',
      'id-ID',
      'PKWT',
      'Perjanjian Kerja Waktu Tertentu',
      'active',
      1,
      '{"show_logo":true,"title":"Perjanjian Kerja Waktu Tertentu"}'::jsonb,
      '[
        {"type":"paragraph","text":"Perjanjian kerja ini dibuat antara {{company_name}} dan {{employee_name}} untuk hubungan kerja PKWT."},
        {"type":"paragraph","text":"Jangka waktu perjanjian: {{contract_duration}}."}
      ]'::jsonb,
      '',
      '{"company_signer_required":true,"employee_signer_required":true}'::jsonb,
      '[
        {"key":"contract_duration","label":"Durasi Kontrak","type":"text","required":true}
      ]'::jsonb,
      TRUE
    ),
    (
      'employment_contract',
      'id-ID',
      'PKWTT',
      'Perjanjian Kerja Waktu Tidak Tertentu',
      'active',
      1,
      '{"show_logo":true,"title":"Perjanjian Kerja Waktu Tidak Tertentu"}'::jsonb,
      '[
        {"type":"paragraph","text":"Perjanjian kerja ini dibuat antara {{company_name}} dan {{employee_name}} untuk hubungan kerja PKWTT."},
        {"type":"paragraph","text":"Masa percobaan: {{probation_duration}}."}
      ]'::jsonb,
      '',
      '{"company_signer_required":true,"employee_signer_required":true}'::jsonb,
      '[
        {"key":"probation_duration","label":"Durasi Probation","type":"text","required":true}
      ]'::jsonb,
      TRUE
    ),
    (
      'employment_contract',
      'id-ID',
      'PKHL',
      'Perjanjian Kerja Harian Lepas',
      'active',
      1,
      '{"show_logo":true,"title":"Perjanjian Kerja Harian Lepas"}'::jsonb,
      '[
        {"type":"paragraph","text":"Perjanjian kerja ini dibuat antara {{company_name}} dan {{employee_name}} untuk hubungan kerja PKHL."},
        {"type":"paragraph","text":"Ketentuan masa kerja dan penugasan mengikuti kebutuhan operasional perusahaan."}
      ]'::jsonb,
      '',
      '{"company_signer_required":true,"employee_signer_required":true}'::jsonb,
      '[]'::jsonb,
      TRUE
    ),
    (
      'payslip',
      'id-ID',
      NULL,
      'Slip Gaji Standar',
      'active',
      1,
      '{"show_logo":true,"title":"Slip Gaji","watermark_setting_key":"document_default_watermark"}'::jsonb,
      '[
        {"type":"paragraph","text":"Dokumen ini bersifat rahasia dan hanya digunakan untuk keperluan payroll."}
      ]'::jsonb,
      '',
      '{"company_signer_required":true,"employee_signer_required":false}'::jsonb,
      '[]'::jsonb,
      TRUE
    ),
    (
      'warning_letter',
      'id-ID',
      NULL,
      'Surat Peringatan',
      'active',
      1,
      '{"show_logo":true,"title":"Surat Peringatan"}'::jsonb,
      '[
        {"type":"paragraph","text":"Surat ini diberikan kepada {{employee_name}} sebagai {{warning_level}} atas pelanggaran yang telah terjadi."}
      ]'::jsonb,
      '',
      '{"company_signer_required":true,"employee_signer_required":false}'::jsonb,
      '[]'::jsonb,
      TRUE
    ),
    (
      'termination_letter',
      'id-ID',
      NULL,
      'Surat Pemutusan Hubungan Kerja',
      'active',
      1,
      '{"show_logo":true,"title":"Surat Pemutusan Hubungan Kerja"}'::jsonb,
      '[
        {"type":"paragraph","text":"Dengan ini perusahaan menyampaikan keputusan terkait berakhirnya hubungan kerja dengan {{employee_name}}."}
      ]'::jsonb,
      '',
      '{"company_signer_required":true,"employee_signer_required":false}'::jsonb,
      '[]'::jsonb,
      TRUE
    )
) AS seed_rows (
  document_type,
  locale,
  contract_type,
  template_name,
  template_status,
  version_no,
  header_json,
  body_json,
  body_markup,
  signature_config_json,
  field_schema_json,
  is_default
)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.hr_document_templates existing
  WHERE existing.document_type = seed_rows.document_type
    AND existing.locale = seed_rows.locale
    AND COALESCE(existing.contract_type, '') = COALESCE(seed_rows.contract_type, '')
    AND existing.version_no = seed_rows.version_no
);

INSERT INTO public.hr_document_reference_options (
  group_key,
  option_key,
  option_label,
  option_value,
  sort_order,
  is_active,
  metadata_json
)
SELECT *
FROM (
  VALUES
    ('contract_type', 'PKWT', 'PKWT', 'PKWT', 1, TRUE, '{}'::jsonb),
    ('contract_type', 'PKWTT', 'PKWTT', 'PKWTT', 2, TRUE, '{}'::jsonb),
    ('contract_type', 'PKHL', 'PKHL', 'PKHL', 3, TRUE, '{}'::jsonb),
    ('payroll_earning_type', 'tunjangan', 'Tunjangan', 'Tunjangan', 1, TRUE, '{}'::jsonb),
    ('payroll_deduction_type', 'pph21', 'PPh21', 'PPh21', 1, TRUE, '{}'::jsonb),
    ('payroll_deduction_type', 'bpjs_kesehatan', 'BPJS Kesehatan', 'BPJS Kesehatan', 2, TRUE, '{}'::jsonb),
    ('payroll_deduction_type', 'bpjs_tk', 'BPJS TK', 'BPJS TK', 3, TRUE, '{}'::jsonb),
    ('sp_level', 'SP1', 'SP1', 'SP1', 1, TRUE, '{}'::jsonb),
    ('sp_level', 'SP2', 'SP2', 'SP2', 2, TRUE, '{}'::jsonb),
    ('sp_level', 'SP3', 'SP3', 'SP3', 3, TRUE, '{}'::jsonb),
    ('termination_legal_basis', 'uu_ketenagakerjaan', 'UU Ketenagakerjaan', 'UU Ketenagakerjaan', 1, TRUE, '{}'::jsonb),
    ('termination_legal_basis', 'peraturan_perusahaan', 'Peraturan Perusahaan', 'Peraturan Perusahaan', 2, TRUE, '{}'::jsonb)
) AS seed_rows (
  group_key,
  option_key,
  option_label,
  option_value,
  sort_order,
  is_active,
  metadata_json
)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.hr_document_reference_options existing
  WHERE existing.group_key = seed_rows.group_key
    AND existing.option_key = seed_rows.option_key
);

COMMIT;
