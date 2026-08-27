ALTER TABLE tasklattice.project_department_models
  ADD COLUMN project_inherited_at TIMESTAMPTZ(6),
  ADD COLUMN project_inherited_by TEXT,
  ADD COLUMN department_assigned_at TIMESTAMPTZ(6),
  ADD COLUMN department_assigned_by TEXT,
  ADD COLUMN default_for TEXT,
  ADD COLUMN default_managed_by TEXT;

UPDATE tasklattice.project_department_models
SET project_inherited_at = created_at;

ALTER TABLE tasklattice.project_department_models
  ADD CONSTRAINT project_department_models_source_check
    CHECK (project_inherited_at IS NOT NULL OR department_assigned_at IS NOT NULL),
  ADD CONSTRAINT project_department_models_default_for_check
    CHECK (default_for IS NULL OR default_for IN ('CHAT', 'EMBEDDING', 'SPEECH_TO_TEXT')),
  ADD CONSTRAINT project_department_models_default_manager_check
    CHECK (
      (default_for IS NULL AND default_managed_by IS NULL)
      OR (default_for IS NOT NULL AND default_managed_by IN ('PROJECT', 'DEPARTMENT'))
    );

CREATE UNIQUE INDEX project_department_models_default_idx
  ON tasklattice.project_department_models (project_id, default_for)
  WHERE default_for IS NOT NULL;

ALTER TABLE tasklattice.project_department_routings
  ADD COLUMN project_inherited_at TIMESTAMPTZ(6),
  ADD COLUMN project_inherited_by TEXT,
  ADD COLUMN department_assigned_at TIMESTAMPTZ(6),
  ADD COLUMN department_assigned_by TEXT,
  ADD COLUMN default_managed_by TEXT;

UPDATE tasklattice.project_department_routings
SET project_inherited_at = created_at,
    default_managed_by = CASE WHEN is_default THEN 'PROJECT' ELSE NULL END;

ALTER TABLE tasklattice.project_department_routings
  ADD CONSTRAINT project_department_routings_source_check
    CHECK (project_inherited_at IS NOT NULL OR department_assigned_at IS NOT NULL),
  ADD CONSTRAINT project_department_routings_default_manager_check
    CHECK (
      (is_default = FALSE AND default_managed_by IS NULL)
      OR (is_default = TRUE AND default_managed_by IN ('PROJECT', 'DEPARTMENT'))
    );

CREATE UNIQUE INDEX project_department_routings_one_default_idx
  ON tasklattice.project_department_routings (project_id)
  WHERE is_default = TRUE;
