ALTER TABLE "tasklattice"."platform_settings"
  ADD COLUMN "control_internal_url" TEXT,
  ADD COLUMN "runner_url" TEXT,
  ADD COLUMN "runner_token_encrypted" TEXT,
  ADD COLUMN "litellm_url" TEXT,
  ADD COLUMN "litellm_master_key_encrypted" TEXT,
  ADD COLUMN "runtime_namespaces_enabled" BOOLEAN,
  ADD COLUMN "runtime_cluster_id" TEXT,
  ADD COLUMN "local_authentication_enabled" BOOLEAN;
