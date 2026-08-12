CREATE TABLE "tasklattice"."agent_catalog" (
  "project_id" TEXT NOT NULL,
  "id" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "owner_user_id" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "agent_catalog_pkey" PRIMARY KEY ("project_id", "id"),
  CONSTRAINT "agent_catalog_owner_kind_check" CHECK (
    ("payload"->>'source' = 'BUILT_IN' AND "owner_user_id" IS NULL)
    OR
    ("payload"->>'source' = 'PROJECT_REGISTERED' AND "owner_user_id" IS NOT NULL)
  )
);

CREATE TABLE "tasklattice"."agent_connections" (
  "project_id" TEXT NOT NULL,
  "id" TEXT NOT NULL,
  "coordinator_instance_id" TEXT NOT NULL,
  "connected_agent_id" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "agent_connections_pkey" PRIMARY KEY ("project_id", "id")
);

CREATE INDEX "agent_catalog_updated_idx"
  ON "tasklattice"."agent_catalog"("project_id", "updated_at" DESC);

CREATE INDEX "agent_catalog_project_owner_idx"
  ON "tasklattice"."agent_catalog"("project_id", "owner_user_id");

CREATE UNIQUE INDEX "agent_connections_unique_binding"
  ON "tasklattice"."agent_connections"(
    "project_id",
    "coordinator_instance_id",
    "connected_agent_id"
  );

CREATE INDEX "agent_connections_connected_idx"
  ON "tasklattice"."agent_connections"("project_id", "connected_agent_id");

ALTER TABLE "tasklattice"."agent_catalog"
  ADD CONSTRAINT "agent_catalog_project_id_fkey"
  FOREIGN KEY ("project_id")
  REFERENCES "tasklattice"."projects"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "tasklattice"."agent_catalog"
  ADD CONSTRAINT "agent_catalog_owner_membership_fkey"
  FOREIGN KEY ("project_id", "owner_user_id")
  REFERENCES "tasklattice"."project_members"("project_id", "user_id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "tasklattice"."agent_connections"
  ADD CONSTRAINT "agent_connections_project_id_fkey"
  FOREIGN KEY ("project_id")
  REFERENCES "tasklattice"."projects"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "tasklattice"."agent_connections"
  ADD CONSTRAINT "agent_connections_coordinator_fkey"
  FOREIGN KEY ("project_id", "coordinator_instance_id")
  REFERENCES "tasklattice"."agents"("project_id", "id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "tasklattice"."agent_connections"
  ADD CONSTRAINT "agent_connections_connected_agent_fkey"
  FOREIGN KEY ("project_id", "connected_agent_id")
  REFERENCES "tasklattice"."agent_catalog"("project_id", "id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
