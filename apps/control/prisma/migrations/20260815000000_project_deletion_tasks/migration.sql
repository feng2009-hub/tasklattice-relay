CREATE TABLE tasklattice.project_deletion_tasks (
  project_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  scheduled_for TIMESTAMPTZ(6) NOT NULL,
  next_attempt_at TIMESTAMPTZ(6) NOT NULL,
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ(6),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT project_deletion_tasks_pkey PRIMARY KEY (project_id),
  CONSTRAINT project_deletion_tasks_status_check
    CHECK (status IN ('scheduled', 'running', 'retry')),
  CONSTRAINT project_deletion_tasks_attempts_check
    CHECK (attempts >= 0),
  CONSTRAINT project_deletion_tasks_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES tasklattice.projects(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX project_deletion_tasks_due_idx
  ON tasklattice.project_deletion_tasks(status, next_attempt_at, scheduled_for);

CREATE INDEX project_deletion_tasks_lease_idx
  ON tasklattice.project_deletion_tasks(lease_expires_at);

INSERT INTO tasklattice.project_deletion_tasks (
  project_id,
  status,
  scheduled_for,
  next_attempt_at,
  created_at,
  updated_at
)
SELECT
  id,
  'scheduled',
  deleted_at + INTERVAL '10 minutes',
  deleted_at + INTERVAL '10 minutes',
  deleted_at,
  deleted_at
FROM tasklattice.projects
WHERE deleted_at IS NOT NULL
ON CONFLICT (project_id) DO NOTHING;
