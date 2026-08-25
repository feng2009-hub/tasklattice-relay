ALTER TABLE tasklattice.agents
  ADD COLUMN deleted_at TIMESTAMPTZ(6);

ALTER TABLE tasklattice.agent_catalog ADD COLUMN deleted_at TIMESTAMPTZ(6);
ALTER TABLE tasklattice.managed_a2a_instances ADD COLUMN deleted_at TIMESTAMPTZ(6);
ALTER TABLE tasklattice.agent_connections ADD COLUMN deleted_at TIMESTAMPTZ(6);
ALTER TABLE tasklattice.provider_accounts ADD COLUMN deleted_at TIMESTAMPTZ(6);
ALTER TABLE tasklattice.model_deployments ADD COLUMN deleted_at TIMESTAMPTZ(6);
ALTER TABLE tasklattice.model_routings ADD COLUMN deleted_at TIMESTAMPTZ(6);
ALTER TABLE tasklattice.sandbox_policies ADD COLUMN deleted_at TIMESTAMPTZ(6);
ALTER TABLE tasklattice.access_policies ADD COLUMN deleted_at TIMESTAMPTZ(6);
ALTER TABLE tasklattice.skills ADD COLUMN deleted_at TIMESTAMPTZ(6);
ALTER TABLE tasklattice.mcp_servers ADD COLUMN deleted_at TIMESTAMPTZ(6);
ALTER TABLE tasklattice.knowledge_sources ADD COLUMN deleted_at TIMESTAMPTZ(6);
ALTER TABLE tasklattice.agent_specializations ADD COLUMN deleted_at TIMESTAMPTZ(6);

CREATE INDEX agents_project_active_created_idx
  ON tasklattice.agents(project_id, deleted_at, created_at DESC);

DROP INDEX tasklattice.agent_connections_unique_binding;
CREATE UNIQUE INDEX agent_connections_unique_active_binding
  ON tasklattice.agent_connections(
    project_id,
    coordinator_instance_id,
    connected_agent_id
  )
  WHERE deleted_at IS NULL;

ALTER TABLE tasklattice.project_deletion_tasks
  DROP CONSTRAINT project_deletion_tasks_status_check;

ALTER TABLE tasklattice.project_deletion_tasks
  ADD CONSTRAINT project_deletion_tasks_status_check
  CHECK (status IN ('scheduled', 'running', 'retry', 'completed'));
