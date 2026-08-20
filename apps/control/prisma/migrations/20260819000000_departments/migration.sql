CREATE TABLE tasklattice.departments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  hard_budget_usd DECIMAL(18, 6),
  status TEXT NOT NULL DEFAULT 'active',
  created_by TEXT NOT NULL REFERENCES tasklattice.users(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT departments_status_check CHECK (status IN ('active', 'suspended')),
  CONSTRAINT departments_budget_check CHECK (hard_budget_usd IS NULL OR hard_budget_usd >= 0)
);

CREATE TABLE tasklattice.department_members (
  department_id TEXT NOT NULL REFERENCES tasklattice.departments(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  user_id TEXT NOT NULL REFERENCES tasklattice.users(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  status TEXT NOT NULL DEFAULT 'active',
  joined_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  PRIMARY KEY (department_id, user_id),
  CONSTRAINT department_members_status_check CHECK (status IN ('active', 'suspended'))
);

CREATE INDEX department_members_user_status_idx
  ON tasklattice.department_members(user_id, status);

INSERT INTO tasklattice.departments (
  id, name, description, hard_budget_usd, created_by
)
VALUES (
  'dep1',
  'dep1',
  'Default local Department for Project organization and budget governance.',
  NULL,
  'local-admin'
);

INSERT INTO tasklattice.department_members (department_id, user_id)
VALUES ('dep1', 'local-admin');

ALTER TABLE tasklattice.projects
  ADD COLUMN department_id TEXT;

UPDATE tasklattice.projects
SET department_id = 'dep1';

ALTER TABLE tasklattice.projects
  ALTER COLUMN department_id SET NOT NULL,
  ADD CONSTRAINT projects_department_id_fkey
    FOREIGN KEY (department_id) REFERENCES tasklattice.departments(id)
    ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX IF EXISTS tasklattice.projects_name_key;

CREATE UNIQUE INDEX projects_department_name_key
  ON tasklattice.projects(department_id, name);

CREATE INDEX projects_department_created_idx
  ON tasklattice.projects(department_id, created_at);

-- This repository is pre-release, so the local fixture gets the final product
-- identity instead of carrying a compatibility alias forever. Project foreign
-- keys use ON UPDATE CASCADE and follow this rename.
DROP TRIGGER IF EXISTS projects_name_immutable ON tasklattice.projects;

UPDATE tasklattice.projects
SET id = 'proj1', name = 'proj1'
WHERE id = 'individual';

CREATE TRIGGER projects_name_immutable
  BEFORE UPDATE OF name ON tasklattice.projects
  FOR EACH ROW
  EXECUTE FUNCTION tasklattice.prevent_project_name_change();

-- End local fixture rename.
