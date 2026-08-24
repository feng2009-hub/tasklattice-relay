ALTER TABLE "tasklattice"."departments"
  ADD COLUMN "default_chat_model" TEXT,
  ADD COLUMN "default_embedding_model" TEXT,
  ADD COLUMN "default_routing_mode" TEXT NOT NULL DEFAULT 'PROJECT_MANAGED',
  ADD COLUMN "default_fallback_model" TEXT,
  ADD COLUMN "soft_budget_usd" DECIMAL(18, 6),
  ADD COLUMN "soft_max_instances" INTEGER,
  ADD COLUMN "hard_max_instances" INTEGER,
  ADD COLUMN "soft_max_mcp_integrations" INTEGER,
  ADD COLUMN "hard_max_mcp_integrations" INTEGER,
  ADD COLUMN "soft_max_knowledge_base_integrations" INTEGER,
  ADD COLUMN "hard_max_knowledge_base_integrations" INTEGER,
  ADD COLUMN "default_project_hard_budget_usd" DECIMAL(18, 6),
  ADD COLUMN "default_project_budget_duration" TEXT,
  ADD COLUMN "default_project_tpm_limit" BIGINT,
  ADD COLUMN "default_project_max_instances" INTEGER,
  ADD COLUMN "default_project_max_mcp_integrations" INTEGER,
  ADD COLUMN "default_project_max_knowledge_base_integrations" INTEGER,
  ADD COLUMN "settings_revision" INTEGER NOT NULL DEFAULT 1,
  ADD CONSTRAINT "departments_default_routing_mode_check"
    CHECK ("default_routing_mode" IN ('PROJECT_MANAGED', 'SINGLE', 'FAILOVER')),
  ADD CONSTRAINT "departments_default_project_budget_duration_check"
    CHECK ("default_project_budget_duration" IS NULL OR "default_project_budget_duration" IN ('1d', '7d', '30d'));

ALTER TABLE "tasklattice"."projects"
  ADD COLUMN "inherited_department_defaults" JSONB,
  ADD COLUMN "inherited_department_settings_revision" INTEGER;
