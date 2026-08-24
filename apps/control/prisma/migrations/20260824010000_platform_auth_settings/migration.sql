ALTER TABLE "tasklattice"."platform_settings"
  ADD COLUMN "oidc_enabled" BOOLEAN,
  ADD COLUMN "oidc_display_name" TEXT,
  ADD COLUMN "oidc_issuer" TEXT,
  ADD COLUMN "oidc_client_id" TEXT,
  ADD COLUMN "oidc_client_secret_encrypted" TEXT;

ALTER TABLE "tasklattice"."platform_settings"
  ADD CONSTRAINT "platform_settings_oidc_override_complete_check" CHECK (
    (
      "oidc_enabled" IS NULL
      AND "oidc_display_name" IS NULL
      AND "oidc_issuer" IS NULL
      AND "oidc_client_id" IS NULL
      AND "oidc_client_secret_encrypted" IS NULL
    )
    OR
    (
      "oidc_enabled" IS NOT NULL
      AND "oidc_display_name" IS NOT NULL
      AND "oidc_issuer" IS NOT NULL
      AND "oidc_client_id" IS NOT NULL
      AND "oidc_client_secret_encrypted" IS NOT NULL
    )
  );
