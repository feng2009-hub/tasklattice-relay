ALTER TABLE tasklattice.model_usage_fact
  ADD COLUMN run_id TEXT,
  ADD COLUMN trace_id TEXT;

CREATE INDEX model_usage_fact_run_time_idx
  ON tasklattice.model_usage_fact(project_id, run_id, request_start_time);
