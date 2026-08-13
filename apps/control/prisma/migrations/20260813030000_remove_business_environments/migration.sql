ALTER TABLE tasklattice.projects
  DROP CONSTRAINT IF EXISTS projects_authorization_environment_check,
  DROP COLUMN IF EXISTS authorization_environment;

ALTER TABLE tasklattice.cost_attribution_mapping
  DROP COLUMN IF EXISTS environment_id;

ALTER TABLE tasklattice.model_usage_fact
  DROP COLUMN IF EXISTS environment_id;

-- This table is a derived rollup rebuilt from model_usage_fact. Clear it
-- before collapsing the old key so rows from legacy labels cannot collide.
TRUNCATE TABLE tasklattice.model_usage_daily;

ALTER TABLE tasklattice.model_usage_daily
  DROP CONSTRAINT model_usage_daily_pkey,
  DROP COLUMN environment_id,
  ADD CONSTRAINT model_usage_daily_pkey
    PRIMARY KEY (project_id, usage_date, timezone, group_type, group_id);
