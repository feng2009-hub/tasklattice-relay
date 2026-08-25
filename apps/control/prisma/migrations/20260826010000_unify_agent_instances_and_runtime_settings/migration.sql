-- Supervisor runtimes and onboarded A2A runtimes share one identity space.
-- `kind` describes the runtime role; it does not create a separate hierarchy.
ALTER TABLE tasklattice.agents
  ADD COLUMN kind TEXT NOT NULL DEFAULT 'SUPERVISOR',
  ADD COLUMN catalog_agent_id TEXT,
  ADD COLUMN updated_at TIMESTAMPTZ(6);

UPDATE tasklattice.agents
SET updated_at = created_at
WHERE updated_at IS NULL;

ALTER TABLE tasklattice.agents
  ALTER COLUMN updated_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP,
  ADD CONSTRAINT agents_kind_check
    CHECK (kind IN ('SUPERVISOR', 'A2A')),
  ADD CONSTRAINT agents_catalog_agent_shape_check
    CHECK (
      (kind = 'SUPERVISOR' AND catalog_agent_id IS NULL)
      OR (kind = 'A2A' AND catalog_agent_id IS NOT NULL)
    ),
  ADD CONSTRAINT agents_catalog_agent_fkey
    FOREIGN KEY (project_id, catalog_agent_id)
    REFERENCES tasklattice.agent_catalog(project_id, id)
    ON DELETE CASCADE;

INSERT INTO tasklattice.agents (
  project_id,
  id,
  kind,
  catalog_agent_id,
  payload,
  owner_user_id,
  created_at,
  updated_at,
  deleted_at
)
SELECT
  project_id,
  id,
  'A2A',
  agent_id,
  jsonb_set(payload, '{kind}', '"A2A"'::jsonb, true),
  owner_user_id,
  created_at,
  updated_at,
  deleted_at
FROM tasklattice.managed_a2a_instances;

CREATE INDEX agents_project_kind_catalog_idx
  ON tasklattice.agents(project_id, kind, catalog_agent_id);

DROP TABLE tasklattice.managed_a2a_instances;

-- Runtime image settings are keyed by the shared runtime manifest. Adding a
-- platform no longer requires one database column and one service branch.
ALTER TABLE tasklattice.platform_settings
  ADD COLUMN runtime_images JSONB;

UPDATE tasklattice.platform_settings
SET runtime_images = jsonb_build_object(
  'openclaw', openclaw_sandbox_image,
  'hermes', hermes_sandbox_image,
  'deepagents', NULL
);

ALTER TABLE tasklattice.platform_settings
  DROP COLUMN openclaw_sandbox_image,
  DROP COLUMN hermes_sandbox_image;
