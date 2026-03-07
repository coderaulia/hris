-- ==================================================
-- OPTIONAL BACKFILL (INSERT-ONLY)
-- Copy legacy JSON columns from employees into normalized tables.
-- Safe: ON CONFLICT DO NOTHING (no overwrite, no delete).
-- Run only after 20260307_safe_next_steps.sql
-- ==================================================

BEGIN;

INSERT INTO employee_assessments (employee_id, assessment_type, percentage, seniority, assessed_at, assessed_by, source_date)
SELECT
  e.employee_id,
  'manager',
  COALESCE(e.percentage, 0),
  COALESCE(e.seniority, ''),
  e.assessment_updated_at,
  e.assessment_updated_by,
  COALESCE(NULLIF(e.date_updated, ''), COALESCE(NULLIF(e.date_created, ''), '-'))
FROM employees e
WHERE COALESCE(e.percentage, 0) > 0
   OR jsonb_array_length(COALESCE(e.scores, '[]'::jsonb)) > 0
ON CONFLICT (employee_id, assessment_type) DO NOTHING;

INSERT INTO employee_assessments (employee_id, assessment_type, percentage, seniority, assessed_at, assessed_by, source_date)
SELECT
  e.employee_id,
  'self',
  COALESCE(e.self_percentage, 0),
  COALESCE(e.seniority, ''),
  e.self_assessment_updated_at,
  e.self_assessment_updated_by,
  COALESCE(NULLIF(e.self_date, ''), '-')
FROM employees e
WHERE COALESCE(e.self_percentage, 0) > 0
   OR jsonb_array_length(COALESCE(e.self_scores, '[]'::jsonb)) > 0
ON CONFLICT (employee_id, assessment_type) DO NOTHING;

INSERT INTO employee_assessment_scores (assessment_id, competency_name, score, note)
SELECT
  ea.id,
  score_item ->> 'q',
  CASE WHEN COALESCE(score_item ->> 's', '') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (score_item ->> 's')::numeric ELSE 0 END,
  COALESCE(score_item ->> 'n', '')
FROM employees e
JOIN employee_assessments ea ON ea.employee_id = e.employee_id AND ea.assessment_type = 'manager'
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(e.scores, '[]'::jsonb)) score_item
WHERE COALESCE(score_item ->> 'q', '') <> ''
ON CONFLICT (assessment_id, competency_name) DO NOTHING;

INSERT INTO employee_assessment_scores (assessment_id, competency_name, score, note)
SELECT
  ea.id,
  score_item ->> 'q',
  CASE WHEN COALESCE(score_item ->> 's', '') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (score_item ->> 's')::numeric ELSE 0 END,
  COALESCE(score_item ->> 'n', '')
FROM employees e
JOIN employee_assessments ea ON ea.employee_id = e.employee_id AND ea.assessment_type = 'self'
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(e.self_scores, '[]'::jsonb)) score_item
WHERE COALESCE(score_item ->> 'q', '') <> ''
ON CONFLICT (assessment_id, competency_name) DO NOTHING;

INSERT INTO employee_assessment_history (employee_id, assessment_type, assessed_on, percentage, seniority, position)
SELECT
  e.employee_id,
  'manager',
  COALESCE(hist_item ->> 'date', '-'),
  CASE WHEN COALESCE(hist_item ->> 'score', '') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (hist_item ->> 'score')::numeric ELSE 0 END,
  COALESCE(hist_item ->> 'seniority', COALESCE(e.seniority, '')),
  COALESCE(hist_item ->> 'position', COALESCE(e.position, ''))
FROM employees e
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(e.history, '[]'::jsonb)) hist_item
ON CONFLICT (employee_id, assessment_type, assessed_on, percentage, seniority, position) DO NOTHING;

INSERT INTO employee_training_records (employee_id, course, start_date, end_date, provider, status, notes)
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
FROM employees e
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(e.training_history, '[]'::jsonb)) train_item
WHERE COALESCE(train_item ->> 'course', '') <> ''
ON CONFLICT (employee_id, course, start_date, end_date, provider, status) DO NOTHING;

COMMIT;
