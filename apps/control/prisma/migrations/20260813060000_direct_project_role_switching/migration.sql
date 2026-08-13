-- Every role explicitly assigned to an Account can be selected directly.
-- Preserve the current membership role as an assignment before removing the
-- temporary-activation model introduced by the preceding migration.
INSERT INTO tasklattice.project_member_role_assignments (
  project_id, user_id, role, mode
)
SELECT
  project_id,
  user_id,
  role,
  'active'::tasklattice.project_role_assignment_mode
FROM tasklattice.project_members
ON CONFLICT (project_id, user_id, role) DO NOTHING;

-- Accounts migrated from the former permanent Administrator role should
-- continue in that role. Their former developer baseline remains assigned and
-- can still be selected directly.
UPDATE tasklattice.project_members AS member
SET role = 'admin'
WHERE EXISTS (
  SELECT 1
  FROM tasklattice.project_member_role_assignments AS assignment
  WHERE assignment.project_id = member.project_id
    AND assignment.user_id = member.user_id
    AND assignment.role = 'admin'
    AND assignment.mode = 'eligible'
);

DROP TABLE tasklattice.project_role_activations;

DROP INDEX tasklattice.project_member_role_assignments_project_role_mode_idx;
ALTER TABLE tasklattice.project_member_role_assignments DROP COLUMN mode;
CREATE INDEX project_member_role_assignments_project_role_idx
  ON tasklattice.project_member_role_assignments(project_id, role);

DROP TYPE tasklattice.project_role_assignment_mode;
