-- ==================================================
-- Dashboard server-side summary and operational views
-- Date: 2026-04-09
-- Safe: additive / idempotent
-- ==================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.dashboard_scope_employee(target_employee_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    is_superadmin()
    OR is_hr_user()
    OR can_access_employee(target_employee_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.dashboard_failed_notifications_count()
RETURNS BIGINT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total BIGINT := 0;
BEGIN
  IF to_regclass('public.notification_queue') IS NULL THEN
    RETURN 0;
  END IF;

  EXECUTE $sql$
    SELECT count(*)
    FROM public.notification_queue
    WHERE lower(coalesce(status, '')) = 'failed'
  $sql$ INTO total;

  RETURN COALESCE(total, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.dashboard_open_hires_count()
RETURNS BIGINT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total BIGINT := 0;
BEGIN
  IF to_regclass('public.planned_hires') IS NULL THEN
    RETURN 0;
  END IF;

  EXECUTE $sql$
    SELECT count(*)
    FROM public.planned_hires
    WHERE lower(coalesce(status, '')) NOT IN ('filled', 'cancelled')
  $sql$ INTO total;

  RETURN COALESCE(total, 0);
END;
$$;

CREATE OR REPLACE VIEW public.dashboard_summary
WITH (security_invoker = true)
AS
SELECT
  (
    SELECT count(*)
    FROM public.employees e
    WHERE e.role = 'employee'
      AND public.dashboard_scope_employee(e.employee_id)
  )::BIGINT AS active_employees,
  (
    SELECT count(DISTINCT pr.employee_id)
    FROM public.probation_reviews pr
    WHERE public.dashboard_scope_employee(pr.employee_id)
      AND lower(coalesce(pr.decision, 'pending')) IN ('pending', 'extend')
      AND (
        pr.review_period_end IS NULL
        OR pr.review_period_end >= CURRENT_DATE
      )
  )::BIGINT AS on_probation,
  (
    SELECT count(*)
    FROM public.pip_plans pp
    WHERE public.dashboard_scope_employee(pp.employee_id)
      AND lower(coalesce(pp.status, '')) = 'active'
  )::BIGINT AS active_pips,
  (
    SELECT count(*)
    FROM public.employee_kpi_target_versions etv
    WHERE public.dashboard_scope_employee(etv.employee_id)
      AND lower(coalesce(etv.status, '')) = 'pending'
  )::BIGINT AS kpi_pending_approval,
  public.dashboard_failed_notifications_count() AS failed_notifications,
  public.dashboard_open_hires_count() AS open_hires;

CREATE OR REPLACE VIEW public.dashboard_probation_expiry
WITH (security_invoker = true)
AS
WITH scoped_reviews AS (
  SELECT
    pr.id AS probation_review_id,
    pr.employee_id,
    e.name,
    COALESCE(NULLIF(e.department, ''), 'Unassigned') AS department,
    COALESCE(NULLIF(e.position, ''), '-') AS position,
    pr.review_period_end AS probation_end_date,
    GREATEST((pr.review_period_end - CURRENT_DATE), 0)::INTEGER AS days_remaining,
    row_number() OVER (
      PARTITION BY pr.employee_id
      ORDER BY pr.review_period_end ASC NULLS LAST, pr.created_at DESC
    ) AS row_no
  FROM public.probation_reviews pr
  JOIN public.employees e
    ON e.employee_id = pr.employee_id
  WHERE public.dashboard_scope_employee(pr.employee_id)
    AND lower(coalesce(pr.decision, 'pending')) IN ('pending', 'extend')
    AND pr.review_period_end IS NOT NULL
    AND pr.review_period_end >= CURRENT_DATE
    AND pr.review_period_end <= CURRENT_DATE + 30
)
SELECT
  probation_review_id,
  employee_id,
  name,
  department,
  position,
  probation_end_date,
  days_remaining
FROM scoped_reviews
WHERE row_no = 1
ORDER BY days_remaining ASC, probation_end_date ASC, name ASC;

CREATE OR REPLACE VIEW public.dashboard_assessment_coverage
WITH (security_invoker = true)
AS
WITH scoped_employees AS (
  SELECT
    e.employee_id,
    COALESCE(NULLIF(e.department, ''), 'Unassigned') AS department
  FROM public.employees e
  WHERE e.role = 'employee'
    AND public.dashboard_scope_employee(e.employee_id)
),
latest_manager_assessment AS (
  SELECT
    ea.employee_id,
    MAX(ea.assessed_at) AS last_assessed_at
  FROM public.employee_assessments ea
  WHERE ea.assessment_type = 'manager'
    AND COALESCE(ea.percentage, 0) > 0
  GROUP BY ea.employee_id
)
SELECT
  se.department,
  count(*)::INTEGER AS active_employee_count,
  count(*) FILTER (
    WHERE lma.last_assessed_at >= NOW() - INTERVAL '90 days'
  )::INTEGER AS covered_employee_count,
  (
    count(*) - count(*) FILTER (
      WHERE lma.last_assessed_at >= NOW() - INTERVAL '90 days'
    )
  )::INTEGER AS missing_employee_count,
  ROUND(
    CASE
      WHEN count(*) = 0 THEN 0
      ELSE (
        count(*) FILTER (
          WHERE lma.last_assessed_at >= NOW() - INTERVAL '90 days'
        )::NUMERIC * 100
      ) / count(*)
    END,
    1
  ) AS coverage_pct
FROM scoped_employees se
LEFT JOIN latest_manager_assessment lma
  ON lma.employee_id = se.employee_id
GROUP BY se.department
ORDER BY coverage_pct ASC, se.department ASC;

CREATE INDEX IF NOT EXISTS idx_probation_reviews_end_date_scope
  ON public.probation_reviews(review_period_end, decision, employee_id);

CREATE INDEX IF NOT EXISTS idx_employee_assessments_employee_type_recent
  ON public.employee_assessments(employee_id, assessment_type, assessed_at DESC);

GRANT SELECT ON public.dashboard_summary TO authenticated;
GRANT SELECT ON public.dashboard_probation_expiry TO authenticated;
GRANT SELECT ON public.dashboard_assessment_coverage TO authenticated;

COMMIT;
