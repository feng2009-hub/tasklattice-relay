CREATE TABLE "tasklattice"."project_runs" (
  "project_id" TEXT NOT NULL,
  "id" TEXT NOT NULL,
  "instance_id" TEXT NOT NULL,
  "agent_platform" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "external_run_id" TEXT NOT NULL,
  "trigger_type" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "trace_id" TEXT,
  "started_at" TIMESTAMPTZ(6) NOT NULL,
  "ended_at" TIMESTAMPTZ(6),
  "duration_ms" INTEGER,
  "terminal_reason" TEXT,
  "error_category" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "project_runs_pkey" PRIMARY KEY ("project_id", "id"),
  CONSTRAINT "project_runs_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "tasklattice"."projects"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "project_runs_agent_platform_check"
    CHECK ("agent_platform" IN ('openclaw', 'hermes')),
  CONSTRAINT "project_runs_source_check"
    CHECK ("source" IN ('openclaw', 'hermes')),
  CONSTRAINT "project_runs_trigger_type_check"
    CHECK ("trigger_type" IN ('USER', 'SCHEDULED', 'DELEGATION', 'API', 'UNKNOWN')),
  CONSTRAINT "project_runs_status_check"
    CHECK ("status" IN ('RUNNING', 'SUCCEEDED', 'FAILED', 'TIMED_OUT', 'CANCELLED', 'BLOCKED')),
  CONSTRAINT "project_runs_duration_check"
    CHECK ("duration_ms" IS NULL OR "duration_ms" >= 0),
  CONSTRAINT "project_runs_terminal_time_check"
    CHECK (
      ("status" = 'RUNNING' AND "ended_at" IS NULL)
      OR
      ("status" <> 'RUNNING' AND "ended_at" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "project_runs_runtime_id_key"
  ON "tasklattice"."project_runs"("project_id", "instance_id", "source", "external_run_id");

CREATE INDEX "project_runs_project_started_idx"
  ON "tasklattice"."project_runs"("project_id", "started_at" DESC);

CREATE INDEX "project_runs_project_status_started_idx"
  ON "tasklattice"."project_runs"("project_id", "status", "started_at" DESC);

CREATE INDEX "project_runs_project_instance_started_idx"
  ON "tasklattice"."project_runs"("project_id", "instance_id", "started_at" DESC);
