UPDATE "tasklattice"."external_role_bindings"
SET
  "subject_value" = CASE
    WHEN "scope" = 'PLATFORM'
      THEN '/tali/r/' || "role_id"
    WHEN "scope" = 'DEPARTMENT'
      THEN '/tali/d/' || "department_id" || '/r/' || "role_id"
    WHEN "scope" = 'PROJECT'
      THEN '/tali/d/' || "department_id" || '/p/' || "project_id" || '/r/' || "role_id"
  END,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "subject_type" = 'GROUP';

ALTER TABLE "tasklattice"."external_role_bindings"
  DROP CONSTRAINT "external_role_bindings_subject_path_check";

ALTER TABLE "tasklattice"."external_role_bindings"
  ADD CONSTRAINT "external_role_bindings_subject_path_check" CHECK (
    "subject_type" <> 'GROUP'
    OR "subject_value" = CASE
      WHEN "scope" = 'PLATFORM'
        THEN '/tali/r/' || "role_id"
      WHEN "scope" = 'DEPARTMENT'
        THEN '/tali/d/' || "department_id" || '/r/' || "role_id"
      WHEN "scope" = 'PROJECT'
        THEN '/tali/d/' || "department_id" || '/p/' || "project_id" || '/r/' || "role_id"
    END
  );
