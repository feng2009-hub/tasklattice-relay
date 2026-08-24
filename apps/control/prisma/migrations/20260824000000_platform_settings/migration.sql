ALTER TYPE "tasklattice"."system_role"
  RENAME VALUE 'super_administrator' TO 'platform_administrator';

CREATE TABLE "tasklattice"."platform_settings" (
  "id" TEXT NOT NULL DEFAULT 'platform',
  "openclaw_sandbox_image" TEXT,
  "hermes_sandbox_image" TEXT,
  "enabled_provider_kinds" JSONB,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "updated_by" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_settings_singleton_check" CHECK ("id" = 'platform')
);
