CREATE TABLE tasklattice.department_inference_resources (
  department_id TEXT NOT NULL,
  id TEXT NOT NULL,
  kind TEXT NOT NULL,
  provider_account_id TEXT,
  payload JSONB NOT NULL,
  credential_payload TEXT,
  created_at TIMESTAMPTZ(6) NOT NULL,
  deleted_at TIMESTAMPTZ(6),
  CONSTRAINT department_inference_resources_pkey PRIMARY KEY (department_id, id),
  CONSTRAINT department_inference_resources_department_fkey
    FOREIGN KEY (department_id) REFERENCES tasklattice.departments(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT department_inference_resources_kind_check
    CHECK (kind IN ('PROVIDER', 'MODEL', 'GATEWAY', 'ROUTING')),
  CONSTRAINT department_inference_resources_credential_check
    CHECK ((kind = 'PROVIDER' AND credential_payload IS NOT NULL)
      OR (kind <> 'PROVIDER' AND credential_payload IS NULL))
);

CREATE INDEX department_inference_resources_kind_idx
  ON tasklattice.department_inference_resources
  (department_id, kind, deleted_at, created_at DESC);

CREATE INDEX department_inference_resources_provider_idx
  ON tasklattice.department_inference_resources
  (department_id, provider_account_id);

CREATE TABLE tasklattice.department_model_routing_audit (
  department_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  model_routing_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT department_model_routing_audit_pkey PRIMARY KEY (department_id, event_id),
  CONSTRAINT department_model_routing_audit_department_fkey
    FOREIGN KEY (department_id) REFERENCES tasklattice.departments(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX department_model_routing_audit_routing_idx
  ON tasklattice.department_model_routing_audit
  (department_id, model_routing_id, created_at DESC);

CREATE TABLE tasklattice.project_department_models (
  project_id TEXT NOT NULL,
  department_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT project_department_models_pkey PRIMARY KEY (project_id, resource_id),
  CONSTRAINT project_department_models_project_fkey
    FOREIGN KEY (project_id) REFERENCES tasklattice.projects(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT project_department_models_resource_fkey
    FOREIGN KEY (department_id, resource_id)
    REFERENCES tasklattice.department_inference_resources(department_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX project_department_models_resource_idx
  ON tasklattice.project_department_models (department_id, resource_id);

CREATE TABLE tasklattice.project_department_routings (
  project_id TEXT NOT NULL,
  department_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  litellm_team_id TEXT,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT project_department_routings_pkey PRIMARY KEY (project_id, resource_id),
  CONSTRAINT project_department_routings_project_fkey
    FOREIGN KEY (project_id) REFERENCES tasklattice.projects(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT project_department_routings_resource_fkey
    FOREIGN KEY (department_id, resource_id)
    REFERENCES tasklattice.department_inference_resources(department_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX project_department_routings_resource_idx
  ON tasklattice.project_department_routings (department_id, resource_id);

CREATE INDEX project_department_routings_default_idx
  ON tasklattice.project_department_routings (project_id, is_default);

ALTER TABLE tasklattice.model_routing_bindings
  DROP CONSTRAINT model_routing_bindings_project_id_model_routing_id_fkey;
