CREATE SCHEMA IF NOT EXISTS tasklattice;

CREATE TABLE IF NOT EXISTS tasklattice.users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  auth_provider TEXT NOT NULL DEFAULT 'local',
  external_subject TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasklattice.workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('personal', 'team')),
  avatar TEXT,
  created_by TEXT NOT NULL REFERENCES tasklattice.users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasklattice.workspace_members (
  workspace_id TEXT NOT NULL REFERENCES tasklattice.workspaces(id) ON DELETE CASCADE ON UPDATE CASCADE,
  user_id TEXT NOT NULL REFERENCES tasklattice.users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS tasklattice.workspace_invitations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES tasklattice.workspaces(id) ON DELETE CASCADE ON UPDATE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  invited_by TEXT NOT NULL REFERENCES tasklattice.users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, email)
);

CREATE TABLE IF NOT EXISTS tasklattice.agents (
  workspace_id TEXT NOT NULL REFERENCES tasklattice.workspaces(id) ON DELETE CASCADE ON UPDATE CASCADE,
  id TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS tasklattice.provider_accounts (
  workspace_id TEXT NOT NULL REFERENCES tasklattice.workspaces(id) ON DELETE CASCADE ON UPDATE CASCADE,
  id TEXT NOT NULL,
  payload JSONB NOT NULL,
  credential_payload TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS tasklattice.model_deployments (
  workspace_id TEXT NOT NULL REFERENCES tasklattice.workspaces(id) ON DELETE CASCADE ON UPDATE CASCADE,
  id TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id, provider_account_id)
    REFERENCES tasklattice.provider_accounts(workspace_id, id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS tasklattice.agent_cost_keys (
  workspace_id TEXT NOT NULL REFERENCES tasklattice.workspaces(id) ON DELETE CASCADE ON UPDATE CASCADE,
  agent_id TEXT NOT NULL,
  token_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, agent_id)
);

CREATE TABLE IF NOT EXISTS tasklattice.inference_gateways (
  workspace_id TEXT NOT NULL REFERENCES tasklattice.workspaces(id) ON DELETE CASCADE ON UPDATE CASCADE,
  id TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS tasklattice.inference_groups (
  workspace_id TEXT NOT NULL REFERENCES tasklattice.workspaces(id) ON DELETE CASCADE ON UPDATE CASCADE,
  id TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS tasklattice.inference_group_bindings (
  workspace_id TEXT NOT NULL REFERENCES tasklattice.workspaces(id) ON DELETE CASCADE ON UPDATE CASCADE,
  id TEXT NOT NULL,
  inference_group_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, id)
);
CREATE INDEX IF NOT EXISTS inference_group_bindings_agent_idx
  ON tasklattice.inference_group_bindings(workspace_id, agent_id, created_at DESC);

CREATE TABLE IF NOT EXISTS tasklattice.inference_group_audit (
  workspace_id TEXT NOT NULL REFERENCES tasklattice.workspaces(id) ON DELETE CASCADE ON UPDATE CASCADE,
  event_id TEXT NOT NULL,
  inference_group_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, event_id)
);

CREATE TABLE IF NOT EXISTS tasklattice.sandbox_policies (
  workspace_id TEXT NOT NULL REFERENCES tasklattice.workspaces(id) ON DELETE CASCADE ON UPDATE CASCADE,
  id TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS tasklattice.extension_skills (
  workspace_id TEXT NOT NULL REFERENCES tasklattice.workspaces(id) ON DELETE CASCADE ON UPDATE CASCADE,
  id TEXT NOT NULL,
  payload JSONB NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 1000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS tasklattice.extension_mcp_servers (
  workspace_id TEXT NOT NULL REFERENCES tasklattice.workspaces(id) ON DELETE CASCADE ON UPDATE CASCADE,
  id TEXT NOT NULL,
  payload JSONB NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 1000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS tasklattice.extension_knowledge_sources (
  workspace_id TEXT NOT NULL REFERENCES tasklattice.workspaces(id) ON DELETE CASCADE ON UPDATE CASCADE,
  id TEXT NOT NULL,
  payload JSONB NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 1000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS tasklattice.agent_specializations (
  workspace_id TEXT NOT NULL REFERENCES tasklattice.workspaces(id) ON DELETE CASCADE ON UPDATE CASCADE,
  id TEXT NOT NULL,
  payload JSONB NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 1000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, id)
);

CREATE TABLE IF NOT EXISTS tasklattice.cost_attribution_mapping (
  workspace_id TEXT NOT NULL REFERENCES tasklattice.workspaces(id) ON DELETE CASCADE ON UPDATE CASCADE,
  id TEXT NOT NULL,
  environment_id TEXT NOT NULL,
  instance_id TEXT NOT NULL,
  instance_name TEXT NOT NULL,
  litellm_virtual_key_id TEXT,
  hashed_token TEXT,
  virtual_key_alias TEXT NOT NULL,
  litellm_user_id TEXT,
  litellm_team_id TEXT,
  provider_account_id TEXT,
  valid_from TIMESTAMPTZ NOT NULL,
  valid_to TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, id)
);
CREATE INDEX IF NOT EXISTS cost_attribution_key_time_idx
  ON tasklattice.cost_attribution_mapping(workspace_id, litellm_virtual_key_id, valid_from, valid_to);
CREATE INDEX IF NOT EXISTS cost_attribution_hash_time_idx
  ON tasklattice.cost_attribution_mapping(workspace_id, hashed_token, valid_from, valid_to);
CREATE INDEX IF NOT EXISTS cost_attribution_user_time_idx
  ON tasklattice.cost_attribution_mapping(workspace_id, litellm_user_id, valid_from, valid_to);

CREATE TABLE IF NOT EXISTS tasklattice.model_endpoint_mapping (
  workspace_id TEXT NOT NULL REFERENCES tasklattice.workspaces(id) ON DELETE CASCADE ON UPDATE CASCADE,
  id TEXT NOT NULL,
  model_endpoint_id TEXT NOT NULL,
  model_endpoint_name TEXT NOT NULL,
  litellm_model_name TEXT,
  litellm_model_group TEXT,
  litellm_model_id TEXT,
  provider TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  provider_account_name TEXT NOT NULL,
  valid_from TIMESTAMPTZ NOT NULL,
  valid_to TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, id)
);
CREATE INDEX IF NOT EXISTS model_endpoint_name_time_idx
  ON tasklattice.model_endpoint_mapping(workspace_id, litellm_model_name, valid_from, valid_to);
CREATE INDEX IF NOT EXISTS model_endpoint_group_time_idx
  ON tasklattice.model_endpoint_mapping(workspace_id, litellm_model_group, valid_from, valid_to);
CREATE INDEX IF NOT EXISTS model_endpoint_id_time_idx
  ON tasklattice.model_endpoint_mapping(workspace_id, litellm_model_id, valid_from, valid_to);

CREATE TABLE IF NOT EXISTS tasklattice.model_usage_fact (
  workspace_id TEXT NOT NULL REFERENCES tasklattice.workspaces(id) ON DELETE CASCADE ON UPDATE CASCADE,
  event_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  request_start_time TIMESTAMPTZ NOT NULL,
  first_token_time TIMESTAMPTZ,
  response_end_time TIMESTAMPTZ,
  usage_date DATE NOT NULL,
  usage_hour SMALLINT NOT NULL,
  environment_id TEXT NOT NULL,
  instance_id TEXT,
  instance_name TEXT,
  model_endpoint_id TEXT,
  model_endpoint_name TEXT,
  provider_account_id TEXT,
  provider_account_name TEXT,
  virtual_key_id TEXT,
  virtual_key_alias TEXT,
  litellm_user_id TEXT,
  litellm_team_id TEXT,
  organization_id TEXT,
  end_user_id TEXT,
  requested_model TEXT NOT NULL,
  resolved_model TEXT NOT NULL,
  model_group TEXT NOT NULL,
  provider TEXT NOT NULL,
  call_type TEXT NOT NULL,
  prompt_tokens BIGINT NOT NULL,
  completion_tokens BIGINT NOT NULL,
  total_tokens BIGINT NOT NULL,
  cached_input_tokens BIGINT NOT NULL,
  cache_creation_input_tokens BIGINT NOT NULL,
  reasoning_tokens BIGINT NOT NULL,
  prompt_cost_usd DECIMAL(65,30),
  completion_cost_usd DECIMAL(65,30),
  total_cost_usd DECIMAL(65,30),
  provider_reported_cost_usd DECIMAL(65,30),
  litellm_calculated_cost_usd DECIMAL(65,30),
  cost_status TEXT NOT NULL,
  cost_source TEXT NOT NULL,
  price_version TEXT NOT NULL,
  success_count SMALLINT NOT NULL,
  failure_count SMALLINT NOT NULL,
  latency_ms INTEGER,
  time_to_first_token_ms INTEGER,
  http_status_code INTEGER,
  error_type TEXT,
  retry_count INTEGER NOT NULL,
  cache_hit BOOLEAN NOT NULL,
  fallback_used BOOLEAN NOT NULL,
  status TEXT NOT NULL,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_record_hash TEXT NOT NULL,
  correction_of_event_id TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, event_id),
  UNIQUE (workspace_id, request_id)
);
CREATE INDEX IF NOT EXISTS model_usage_fact_time_idx
  ON tasklattice.model_usage_fact(workspace_id, request_start_time);

CREATE TABLE IF NOT EXISTS tasklattice.model_usage_fact_observation (
  id BIGSERIAL PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES tasklattice.workspaces(id) ON DELETE CASCADE ON UPDATE CASCADE,
  event_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL,
  source_record_hash TEXT NOT NULL,
  payload JSONB NOT NULL,
  UNIQUE (workspace_id, event_id)
);

CREATE TABLE IF NOT EXISTS tasklattice.model_usage_daily (
  workspace_id TEXT NOT NULL REFERENCES tasklattice.workspaces(id) ON DELETE CASCADE ON UPDATE CASCADE,
  usage_date DATE NOT NULL,
  timezone TEXT NOT NULL,
  environment_id TEXT NOT NULL,
  group_type TEXT NOT NULL,
  group_id TEXT NOT NULL,
  group_name TEXT NOT NULL,
  spend_usd DECIMAL(65,30) NOT NULL,
  prompt_tokens BIGINT NOT NULL,
  completion_tokens BIGINT NOT NULL,
  total_tokens BIGINT NOT NULL,
  requests BIGINT NOT NULL,
  successful_requests BIGINT NOT NULL,
  failed_requests BIGINT NOT NULL,
  active_object_count INTEGER NOT NULL,
  first_request_at TIMESTAMPTZ NOT NULL,
  last_request_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (workspace_id, usage_date, timezone, environment_id, group_type, group_id)
);

CREATE TABLE IF NOT EXISTS tasklattice.cost_sync_checkpoint (
  workspace_id TEXT NOT NULL REFERENCES tasklattice.workspaces(id) ON DELETE CASCADE ON UPDATE CASCADE,
  source TEXT NOT NULL,
  cursor_value TEXT,
  last_successful_end_time TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  sync_lag_seconds INTEGER,
  processed_records BIGINT NOT NULL DEFAULT 0,
  failed_records BIGINT NOT NULL DEFAULT 0,
  duplicate_records BIGINT NOT NULL DEFAULT 0,
  late_arriving_records BIGINT NOT NULL DEFAULT 0,
  source_spend_usd DECIMAL(65,30) NOT NULL DEFAULT 0,
  PRIMARY KEY (workspace_id, source)
);
