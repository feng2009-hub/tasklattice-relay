ALTER TABLE tasklattice.project_quotas
  ADD COLUMN budget_period_started_at TIMESTAMPTZ(6),
  ADD COLUMN budget_resets_at TIMESTAMPTZ(6);

UPDATE tasklattice.project_quotas
SET
  budget_period_started_at = updated_at,
  budget_resets_at = updated_at + CASE budget_duration
    WHEN '1d' THEN INTERVAL '1 day'
    WHEN '7d' THEN INTERVAL '7 days'
    WHEN '30d' THEN INTERVAL '30 days'
  END
WHERE hard_budget_usd IS NOT NULL
  AND budget_duration IN ('1d', '7d', '30d');

ALTER TABLE tasklattice.project_quotas
  ADD CONSTRAINT project_quotas_budget_window_check
  CHECK (
    (hard_budget_usd IS NULL AND budget_duration IS NULL
      AND budget_period_started_at IS NULL AND budget_resets_at IS NULL)
    OR
    (hard_budget_usd IS NOT NULL AND budget_duration IN ('1d', '7d', '30d')
      AND budget_period_started_at IS NOT NULL AND budget_resets_at IS NOT NULL
      AND budget_resets_at > budget_period_started_at)
  );
