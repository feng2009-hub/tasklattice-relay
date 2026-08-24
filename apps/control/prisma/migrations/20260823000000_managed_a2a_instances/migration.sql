CREATE TABLE "tasklattice"."managed_a2a_instances" (
  "project_id" TEXT NOT NULL,
  "id" TEXT NOT NULL,
  "agent_id" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "owner_user_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "managed_a2a_instances_pkey" PRIMARY KEY ("project_id", "id"),
  CONSTRAINT "managed_a2a_instances_project_fkey"
    FOREIGN KEY ("project_id")
    REFERENCES "tasklattice"."projects"("id")
    ON DELETE CASCADE,
  CONSTRAINT "managed_a2a_instances_agent_fkey"
    FOREIGN KEY ("project_id", "agent_id")
    REFERENCES "tasklattice"."agent_catalog"("project_id", "id")
    ON DELETE CASCADE,
  CONSTRAINT "managed_a2a_instances_owner_membership_fkey"
    FOREIGN KEY ("project_id", "owner_user_id")
    REFERENCES "tasklattice"."project_members"("project_id", "user_id")
    ON DELETE RESTRICT
);

CREATE INDEX "managed_a2a_instances_agent_idx"
  ON "tasklattice"."managed_a2a_instances"("project_id", "agent_id");

CREATE INDEX "managed_a2a_instances_owner_idx"
  ON "tasklattice"."managed_a2a_instances"("project_id", "owner_user_id");
