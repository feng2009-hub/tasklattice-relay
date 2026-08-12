ALTER TABLE tasklattice.projects
  ADD COLUMN authorization_environment TEXT NOT NULL DEFAULT 'PROD';

UPDATE tasklattice.projects
SET authorization_environment = CASE
  WHEN type = 'personal' THEN 'DEV'
  ELSE 'PROD'
END;

ALTER TABLE tasklattice.projects
  ADD CONSTRAINT projects_authorization_environment_check
  CHECK (authorization_environment IN ('DEV', 'UAT', 'PROD'));

ALTER TABLE tasklattice.audit_logs
  ADD COLUMN authorization_capability TEXT,
  ADD COLUMN authorization_reason TEXT;

ALTER TABLE tasklattice.audit_logs
  DROP CONSTRAINT audit_logs_authorization_decision_check,
  ADD CONSTRAINT audit_logs_authorization_decision_check
    CHECK (authorization_decision IN ('allowed', 'denied', 'approval_required'));

CREATE INDEX audit_logs_project_capability_idx
  ON tasklattice.audit_logs(project_id, authorization_capability, occurred_at DESC);
