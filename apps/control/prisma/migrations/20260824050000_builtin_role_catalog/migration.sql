-- The Role catalog is a persisted, versioned configuration product. Stable
-- identifiers remain part of the application contract, while Role-to-CAP
-- composition is synchronized into these tables during platform bootstrap.

ALTER TYPE "tasklattice"."project_role"
  RENAME VALUE 'approver' TO 'reviewer';

ALTER TABLE "tasklattice"."external_role_bindings"
  DROP CONSTRAINT "external_role_bindings_scope_check";

UPDATE "tasklattice"."external_role_bindings"
SET "role_id" = 'ROLE_REVIEWER'
WHERE "role_id" = 'ROLE_APPROVER';

ALTER TABLE "tasklattice"."external_role_bindings"
  ADD CONSTRAINT "external_role_bindings_scope_check" CHECK (
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
        'ROLE_REVIEWER'
      )
    )
  );

CREATE TYPE "tasklattice"."authorization_scope" AS ENUM (
  'PLATFORM',
  'DEPARTMENT',
  'PROJECT'
);

CREATE TYPE "tasklattice"."authorization_role_family" AS ENUM (
  'ADMINISTRATION',
  'PROJECT_BUSINESS'
);

CREATE TABLE "tasklattice"."role_catalog_state" (
  "id" TEXT NOT NULL DEFAULT 'builtin',
  "revision" INTEGER NOT NULL,
  "synced_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "role_catalog_state_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tasklattice"."capability_definitions" (
  "id" TEXT NOT NULL,
  "scope" "tasklattice"."authorization_scope" NOT NULL,
  "side_effect" BOOLEAN NOT NULL DEFAULT FALSE,
  "sensitive_content" BOOLEAN NOT NULL DEFAULT FALSE,
  "system_managed" BOOLEAN NOT NULL DEFAULT TRUE,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "capability_definitions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tasklattice"."role_definitions" (
  "id" TEXT NOT NULL,
  "scope" "tasklattice"."authorization_scope" NOT NULL,
  "family" "tasklattice"."authorization_role_family" NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "builtin" BOOLEAN NOT NULL DEFAULT TRUE,
  "assignable" BOOLEAN NOT NULL DEFAULT TRUE,
  "system_managed" BOOLEAN NOT NULL DEFAULT TRUE,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "role_definitions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tasklattice"."role_capability_grants" (
  "role_id" TEXT NOT NULL,
  "capability_id" TEXT NOT NULL,
  "relations" JSONB NOT NULL,

  CONSTRAINT "role_capability_grants_pkey" PRIMARY KEY ("role_id", "capability_id"),
  CONSTRAINT "role_capability_grants_role_fkey"
    FOREIGN KEY ("role_id") REFERENCES "tasklattice"."role_definitions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "role_capability_grants_capability_fkey"
    FOREIGN KEY ("capability_id") REFERENCES "tasklattice"."capability_definitions"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "role_capability_grants_relations_array_check"
    CHECK (jsonb_typeof("relations") = 'array')
);

CREATE INDEX "capability_definitions_scope_sort_idx"
  ON "tasklattice"."capability_definitions" ("scope", "sort_order");

CREATE INDEX "role_definitions_family_sort_idx"
  ON "tasklattice"."role_definitions" ("family", "sort_order");

CREATE INDEX "role_definitions_scope_sort_idx"
  ON "tasklattice"."role_definitions" ("scope", "sort_order");

CREATE INDEX "role_capability_grants_capability_idx"
  ON "tasklattice"."role_capability_grants" ("capability_id");
