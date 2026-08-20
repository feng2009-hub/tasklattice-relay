CREATE TYPE tasklattice.department_role AS ENUM ('administrator', 'member');

ALTER TABLE tasklattice.department_members
  ADD COLUMN role tasklattice.department_role NOT NULL DEFAULT 'member';

-- The bootstrap Account owns the default Department. This Department role is
-- independent from both its internal authentication marker and Project roles.
UPDATE tasklattice.department_members
SET role = 'administrator'
WHERE department_id = 'dep1'
  AND user_id = 'local-admin';

DROP INDEX tasklattice.department_members_user_status_idx;

CREATE INDEX department_members_user_role_status_idx
  ON tasklattice.department_members(user_id, role, status);
