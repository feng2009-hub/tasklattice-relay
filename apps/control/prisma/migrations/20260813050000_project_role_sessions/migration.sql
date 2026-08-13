CREATE TYPE tasklattice.project_role_assignment_mode AS ENUM ('active', 'eligible');

CREATE TABLE tasklattice.project_member_role_assignments (
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role tasklattice.project_role NOT NULL,
  mode tasklattice.project_role_assignment_mode NOT NULL DEFAULT 'active',
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id, role),
  CONSTRAINT project_member_role_assignments_member_fkey
    FOREIGN KEY (project_id, user_id)
    REFERENCES tasklattice.project_members(project_id, user_id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX project_member_role_assignments_project_role_mode_idx
  ON tasklattice.project_member_role_assignments(project_id, role, mode);

CREATE TABLE tasklattice.project_role_activations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role tasklattice.project_role NOT NULL,
  reason TEXT NOT NULL,
  activated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  CONSTRAINT project_role_activations_member_fkey
    FOREIGN KEY (project_id, user_id)
    REFERENCES tasklattice.project_members(project_id, user_id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT project_role_activations_time_check
    CHECK (expires_at > activated_at AND (ended_at IS NULL OR ended_at >= activated_at))
);

CREATE INDEX project_role_activations_member_active_idx
  ON tasklattice.project_role_activations(project_id, user_id, ended_at, expires_at);

CREATE INDEX project_role_activations_project_role_expiry_idx
  ON tasklattice.project_role_activations(project_id, role, expires_at);

-- Existing permanent administrators become just-in-time administrators. They
-- retain Agent Developer as their ordinary working role and explicitly
-- activate Project Administrator only for governed changes.
INSERT INTO tasklattice.project_member_role_assignments (
  project_id, user_id, role, mode
)
SELECT
  project_id,
  user_id,
  'admin'::tasklattice.project_role,
  'eligible'::tasklattice.project_role_assignment_mode
FROM tasklattice.project_members
WHERE role = 'admin'
ON CONFLICT (project_id, user_id, role) DO NOTHING;

UPDATE tasklattice.project_members
SET role = 'developer'
WHERE role = 'admin';
