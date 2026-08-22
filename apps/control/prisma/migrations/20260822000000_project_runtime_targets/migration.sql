CREATE TABLE "tasklattice"."project_runtime_targets" (
  "project_id" TEXT NOT NULL,
  "cluster_id" TEXT NOT NULL,
  "namespace" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "generation" INTEGER NOT NULL DEFAULT 1,
  "observed_generation" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lease_owner" TEXT,
  "lease_expires_at" TIMESTAMPTZ(6),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "last_error" TEXT,
  "last_reconciled_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "project_runtime_targets_pkey" PRIMARY KEY ("project_id"),
  CONSTRAINT "project_runtime_targets_status_check" CHECK (
    "status" IN ('pending', 'reconciling', 'ready', 'retry', 'deleting')
  ),
  CONSTRAINT "project_runtime_targets_generation_check" CHECK (
    "generation" >= 1
    AND "observed_generation" >= 0
    AND "observed_generation" <= "generation"
  )
);

CREATE UNIQUE INDEX "project_runtime_targets_namespace_key"
  ON "tasklattice"."project_runtime_targets"("namespace");

CREATE INDEX "project_runtime_targets_due_idx"
  ON "tasklattice"."project_runtime_targets"("status", "next_attempt_at");

CREATE INDEX "project_runtime_targets_lease_idx"
  ON "tasklattice"."project_runtime_targets"("lease_expires_at");

ALTER TABLE "tasklattice"."project_runtime_targets"
  ADD CONSTRAINT "project_runtime_targets_project_id_fkey"
  FOREIGN KEY ("project_id")
  REFERENCES "tasklattice"."projects"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

-- Existing Projects receive an opaque, deterministic namespace. MD5 is used
-- only as a stable DNS-safe identifier, not as a security primitive.
INSERT INTO "tasklattice"."project_runtime_targets" (
  "project_id",
  "cluster_id",
  "namespace"
)
SELECT
  "id",
  'in-cluster',
  'tali-p-' || md5("id")
FROM "tasklattice"."projects"
ON CONFLICT ("project_id") DO NOTHING;
