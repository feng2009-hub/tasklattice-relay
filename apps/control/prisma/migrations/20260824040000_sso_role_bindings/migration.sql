ALTER TABLE "tasklattice"."platform_settings"
  ADD COLUMN "oidc_group_claim" TEXT NOT NULL DEFAULT 'groups';

ALTER TABLE "tasklattice"."users"
  ADD COLUMN "external_platform_administrator" BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE "tasklattice"."department_members"
  ADD COLUMN "manual_access" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN "external_access_active" BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE "tasklattice"."project_members"
  ADD COLUMN "manual_access" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN "external_access_active" BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE "tasklattice"."project_member_role_assignments"
  ADD COLUMN "manual_assignment" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN "external_assignment_active" BOOLEAN NOT NULL DEFAULT FALSE;

-- Make the provenance of every pre-existing assignment explicit. PostgreSQL
-- already materializes these defaults for existing rows; the updates also
-- document the intended migration invariant for compatible test databases.
UPDATE "tasklattice"."department_members"
SET "manual_access" = TRUE, "external_access_active" = FALSE;

UPDATE "tasklattice"."project_members"
SET "manual_access" = TRUE, "external_access_active" = FALSE;

UPDATE "tasklattice"."project_member_role_assignments"
SET "manual_assignment" = TRUE, "external_assignment_active" = FALSE;

CREATE TYPE "tasklattice"."external_identity_subject_type" AS ENUM (
  'GROUP',
  'CLIENT'
);

CREATE TYPE "tasklattice"."external_role_scope" AS ENUM (
  'PLATFORM',
  'DEPARTMENT',
  'PROJECT'
);

CREATE TABLE "tasklattice"."external_role_bindings" (
  "id" TEXT NOT NULL,
  "provider_id" TEXT NOT NULL DEFAULT 'corporate-sso',
  "subject_type" "tasklattice"."external_identity_subject_type" NOT NULL DEFAULT 'GROUP',
  "subject_value" TEXT NOT NULL,
  "scope" "tasklattice"."external_role_scope" NOT NULL,
  "department_id" TEXT,
  "project_id" TEXT,
  "role_id" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_by" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "external_role_bindings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "external_role_bindings_department_fkey"
    FOREIGN KEY ("department_id") REFERENCES "tasklattice"."departments"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "external_role_bindings_project_fkey"
    FOREIGN KEY ("project_id") REFERENCES "tasklattice"."projects"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "external_role_bindings_subject_path_check" CHECK (
    "subject_type" <> 'GROUP'
    OR (
      left("subject_value", 1) = '/'
      AND right("subject_value", 1) <> '/'
      AND position('//' in "subject_value") = 0
    )
  ),
  CONSTRAINT "external_role_bindings_scope_check" CHECK (
    (
      "scope" = 'PLATFORM'
      AND "department_id" IS NULL
      AND "project_id" IS NULL
      AND "role_id" = 'ROLE_PLATFORM_ADMIN'
    )
    OR (
      "scope" = 'DEPARTMENT'
      AND "department_id" IS NOT NULL
      AND "project_id" IS NULL
      AND "role_id" IN ('ROLE_DEPARTMENT_ADMIN', 'ROLE_DEPARTMENT_MEMBER')
    )
    OR (
      "scope" = 'PROJECT'
      AND "department_id" IS NOT NULL
      AND "project_id" IS NOT NULL
      AND "role_id" IN (
        'ROLE_PROJECT_ADMIN',
        'ROLE_AUDITOR',
        'ROLE_AGENT_DEVELOPER',
        'ROLE_USER',
        'ROLE_APPROVER'
      )
    )
  )
);

CREATE UNIQUE INDEX "external_role_bindings_unique_mapping_idx"
  ON "tasklattice"."external_role_bindings" (
    "provider_id",
    "subject_type",
    "subject_value",
    "scope",
    COALESCE("department_id", ''),
    COALESCE("project_id", ''),
    "role_id"
  );

CREATE INDEX "external_role_bindings_subject_idx"
  ON "tasklattice"."external_role_bindings" (
    "provider_id",
    "subject_type",
    "subject_value",
    "enabled"
  );

CREATE INDEX "external_role_bindings_target_idx"
  ON "tasklattice"."external_role_bindings" (
    "scope",
    "department_id",
    "project_id",
    "role_id"
  );

CREATE TABLE "tasklattice"."external_role_grants" (
  "binding_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "external_role_grants_pkey" PRIMARY KEY ("binding_id", "user_id"),
  CONSTRAINT "external_role_grants_binding_fkey"
    FOREIGN KEY ("binding_id") REFERENCES "tasklattice"."external_role_bindings"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "external_role_grants_user_fkey"
    FOREIGN KEY ("user_id") REFERENCES "tasklattice"."users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "external_role_grants_user_seen_idx"
  ON "tasklattice"."external_role_grants" ("user_id", "last_seen_at");
