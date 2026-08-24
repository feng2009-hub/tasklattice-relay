ALTER TABLE "tasklattice"."platform_settings"
  DROP CONSTRAINT "platform_settings_oidc_override_complete_check";

UPDATE "tasklattice"."platform_settings"
SET
  "oidc_enabled" = COALESCE("oidc_enabled", FALSE),
  "oidc_display_name" = COALESCE("oidc_display_name", 'SSO'),
  "oidc_issuer" = COALESCE("oidc_issuer", ''),
  "oidc_client_id" = COALESCE("oidc_client_id", '');

ALTER TABLE "tasklattice"."platform_settings"
  ALTER COLUMN "oidc_enabled" SET DEFAULT FALSE,
  ALTER COLUMN "oidc_enabled" SET NOT NULL,
  ALTER COLUMN "oidc_display_name" SET DEFAULT 'SSO',
  ALTER COLUMN "oidc_display_name" SET NOT NULL,
  ALTER COLUMN "oidc_issuer" SET DEFAULT '',
  ALTER COLUMN "oidc_issuer" SET NOT NULL,
  ALTER COLUMN "oidc_client_id" SET DEFAULT '',
  ALTER COLUMN "oidc_client_id" SET NOT NULL,
  ADD COLUMN "smtp_enabled" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "smtp_host" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "smtp_port" INTEGER NOT NULL DEFAULT 587,
  ADD COLUMN "smtp_secure" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "smtp_username" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "smtp_password_encrypted" TEXT,
  ADD COLUMN "smtp_from_address" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "smtp_from_name" TEXT NOT NULL DEFAULT 'TaskLattice Relay',
  ADD COLUMN "smtp_reply_to" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "runtime_namespace_deletion_timeout_seconds" INTEGER NOT NULL DEFAULT 120,
  ADD CONSTRAINT "platform_settings_smtp_port_check"
    CHECK ("smtp_port" BETWEEN 1 AND 65535),
  ADD CONSTRAINT "platform_settings_runtime_deletion_timeout_check"
    CHECK ("runtime_namespace_deletion_timeout_seconds" BETWEEN 10 AND 1800);
