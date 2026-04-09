BEGIN;

-- Final defensive backfill from legacy employee mirror columns before removal.
INSERT INTO public.employee_assessments (employee_id, assessment_type, percentage, seniority, assessed_at, assessed_by, source_date)
SELECT
  e.employee_id,
  'manager',
  COALESCE(e.percentage, 0),
  COALESCE(e.seniority, ''),
  e.assessment_updated_at,
  e.assessment_updated_by,
  COALESCE(NULLIF(e.date_updated, ''), COALESCE(NULLIF(e.date_created, ''), '-'))
FROM public.employees e
WHERE (
    COALESCE(e.percentage, 0) > 0
    OR jsonb_array_length(COALESCE(e.scores, '[]'::jsonb)) > 0
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'employees'
      AND column_name = 'percentage'
  )
ON CONFLICT (employee_id, assessment_type)
DO UPDATE SET
  percentage = EXCLUDED.percentage,
  seniority = EXCLUDED.seniority,
  assessed_at = EXCLUDED.assessed_at,
  assessed_by = EXCLUDED.assessed_by,
  source_date = EXCLUDED.source_date,
  updated_at = NOW();

INSERT INTO public.employee_assessments (employee_id, assessment_type, percentage, seniority, assessed_at, assessed_by, source_date)
SELECT
  e.employee_id,
  'self',
  COALESCE(e.self_percentage, 0),
  COALESCE(e.seniority, ''),
  e.self_assessment_updated_at,
  e.self_assessment_updated_by,
  COALESCE(NULLIF(e.self_date, ''), '-')
FROM public.employees e
WHERE (
    COALESCE(e.self_percentage, 0) > 0
    OR jsonb_array_length(COALESCE(e.self_scores, '[]'::jsonb)) > 0
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'employees'
      AND column_name = 'self_percentage'
  )
ON CONFLICT (employee_id, assessment_type)
DO UPDATE SET
  percentage = EXCLUDED.percentage,
  seniority = EXCLUDED.seniority,
  assessed_at = EXCLUDED.assessed_at,
  assessed_by = EXCLUDED.assessed_by,
  source_date = EXCLUDED.source_date,
  updated_at = NOW();

INSERT INTO public.employee_assessment_scores (assessment_id, competency_name, score, note)
SELECT
  ea.id,
  score_item ->> 'q',
  CASE WHEN COALESCE(score_item ->> 's', '') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (score_item ->> 's')::numeric ELSE 0 END,
  COALESCE(score_item ->> 'n', '')
FROM public.employees e
JOIN public.employee_assessments ea
  ON ea.employee_id = e.employee_id
 AND ea.assessment_type = 'manager'
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(e.scores, '[]'::jsonb)) score_item
WHERE COALESCE(score_item ->> 'q', '') <> ''
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'employees'
      AND column_name = 'scores'
  )
ON CONFLICT (assessment_id, competency_name)
DO UPDATE SET
  score = EXCLUDED.score,
  note = EXCLUDED.note,
  updated_at = NOW();

INSERT INTO public.employee_assessment_scores (assessment_id, competency_name, score, note)
SELECT
  ea.id,
  score_item ->> 'q',
  CASE WHEN COALESCE(score_item ->> 's', '') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (score_item ->> 's')::numeric ELSE 0 END,
  COALESCE(score_item ->> 'n', '')
FROM public.employees e
JOIN public.employee_assessments ea
  ON ea.employee_id = e.employee_id
 AND ea.assessment_type = 'self'
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(e.self_scores, '[]'::jsonb)) score_item
WHERE COALESCE(score_item ->> 'q', '') <> ''
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'employees'
      AND column_name = 'self_scores'
  )
ON CONFLICT (assessment_id, competency_name)
DO UPDATE SET
  score = EXCLUDED.score,
  note = EXCLUDED.note,
  updated_at = NOW();

INSERT INTO public.employee_assessment_history (employee_id, assessment_type, assessed_on, percentage, seniority, position)
SELECT
  e.employee_id,
  'manager',
  COALESCE(hist_item ->> 'date', '-'),
  CASE WHEN COALESCE(hist_item ->> 'score', '') ~ '^-?[0-9]+(\.[0-9]+)?$' THEN (hist_item ->> 'score')::numeric ELSE 0 END,
  COALESCE(hist_item ->> 'seniority', COALESCE(e.seniority, '')),
  COALESCE(hist_item ->> 'position', COALESCE(e.position, ''))
FROM public.employees e
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(e.history, '[]'::jsonb)) hist_item
WHERE EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'employees'
    AND column_name = 'history'
)
ON CONFLICT (employee_id, assessment_type, assessed_on, percentage, seniority, position)
DO NOTHING;

INSERT INTO public.employee_training_records (employee_id, course, start_date, end_date, provider, status, notes)
SELECT
  e.employee_id,
  COALESCE(train_item ->> 'course', ''),
  COALESCE(train_item ->> 'start', ''),
  COALESCE(train_item ->> 'end', ''),
  COALESCE(train_item ->> 'provider', ''),
  CASE
    WHEN lower(COALESCE(train_item ->> 'status', 'ongoing')) IN ('planned', 'ongoing', 'completed', 'approved')
      THEN lower(COALESCE(train_item ->> 'status', 'ongoing'))
    ELSE 'ongoing'
  END,
  ''
FROM public.employees e
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(e.training_history, '[]'::jsonb)) train_item
WHERE COALESCE(train_item ->> 'course', '') <> ''
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'employees'
      AND column_name = 'training_history'
  )
ON CONFLICT (employee_id, course, start_date, end_date, provider, status)
DO UPDATE SET
  notes = EXCLUDED.notes,
  updated_at = NOW();

ALTER TABLE public.employees
  DROP COLUMN IF EXISTS percentage,
  DROP COLUMN IF EXISTS scores,
  DROP COLUMN IF EXISTS self_scores,
  DROP COLUMN IF EXISTS self_percentage,
  DROP COLUMN IF EXISTS self_date,
  DROP COLUMN IF EXISTS history,
  DROP COLUMN IF EXISTS training_history,
  DROP COLUMN IF EXISTS date_created,
  DROP COLUMN IF EXISTS date_updated,
  DROP COLUMN IF EXISTS date_next,
  DROP COLUMN IF EXISTS assessment_updated_by,
  DROP COLUMN IF EXISTS assessment_updated_at,
  DROP COLUMN IF EXISTS self_assessment_updated_by,
  DROP COLUMN IF EXISTS self_assessment_updated_at;

COMMIT;
