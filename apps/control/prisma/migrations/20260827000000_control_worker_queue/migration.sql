ALTER TABLE tasklattice.project_deletion_tasks
  ADD COLUMN queue_job_id UUID;

CREATE UNIQUE INDEX project_deletion_tasks_queue_job_id_key
  ON tasklattice.project_deletion_tasks(queue_job_id);

ALTER TABLE tasklattice.project_deletion_tasks
  DROP CONSTRAINT project_deletion_tasks_status_check;

ALTER TABLE tasklattice.project_deletion_tasks
  ADD CONSTRAINT project_deletion_tasks_status_check
  CHECK (status IN ('scheduled', 'running', 'retry', 'completed', 'failed'));

-- Existing scheduled/retry work is attached to pg-boss by the Control Worker.
-- Prisma remains the owner of product/domain tables while pg-boss manages only
-- its private tali_control_jobs schema.
