# Control Worker

TaskLattice Relay runs slow and retryable control-plane operations in an
independent `control-worker` Deployment. HTTP request handlers remain
responsible for validation, authorization, and writing desired state. The
Worker is responsible for eventual external side effects.

## Queue and transaction boundary

The Worker uses `pg-boss` with the existing PostgreSQL database. The library
owns the private `tali_control_jobs` schema; Prisma continues to own the
`tasklattice` product schema. Project deletion writes the Project tombstone,
the domain `ProjectDeletionTask`, and the delayed queue job in one database
transaction. A failure to enqueue therefore rolls back the deletion request.
The PostgreSQL role configured for Control must be able to create and migrate
the `tali_control_jobs` schema when the queue starts for the first time.

Queue delivery must be treated as at-least-once. Task handlers reload current
desired state and all Kubernetes operations remain idempotent. Namespace
ownership annotations and Kubernetes UID preconditions prevent the Worker from
adopting or deleting an unrelated Namespace.

The initial queues are:

- `control-instance-lifecycle`: durable Instance provisioning and deletion.
  Jobs are serialized per Instance; retries reload desired state, reconcile any
  existing Sandbox, and clean up partial LiteLLM credentials before retrying.
  Normal Instance deletion blocks its LiteLLM Virtual Key and closes the local
  attribution window without deleting the key record, preserving Key, Team,
  Alias, and spend identity for billing reconciliation. Only unused credentials
  created by a failed provisioning attempt are permanently deleted.
- `control-project-delete`: delayed Project cleanup, including external
  resources and final Namespace deletion.
- `control-project-runtime-reconcile`: one Project Runtime Namespace and
  compatibility OpenShell Gateway repair.
- `control-maintenance`: a short periodic scan that reattaches orphaned
  Instance lifecycle and pre-migration Project deletion tasks, then fans out
  stale Runtime Targets.
- `control-dead-letter`: terminal failures after the configured retry limit.

## Status and logs

Queue rows are execution state, not product state. Domain tables retain the
status, attempts, last error, reconciliation generation, and timestamps needed
by APIs and operator tooling. Successful and failed queue jobs are retained for
bounded operational inspection.

The Worker writes JSON logs to stdout. Every task log includes the Worker ID,
queue and job IDs, attempt, Project ID, duration, outcome, and error details.
Kubernetes therefore exposes the Worker stream independently:

```bash
kubectl -n <control-namespace> logs deployment/<release>-control-worker
```

The Worker exposes `/livez` and `/readyz` on port `9090`. Readiness verifies
that queue initialization completed and PostgreSQL remains available.

## Scaling and permissions

PostgreSQL claims and per-Project queue groups make multiple replicas safe.
The default is one replica because normal control-plane task volume is low.
OpenShell Gateway reconciliation is serial within each Worker because each job
may hold a Helm child process and its rendered release state in memory.
The Worker has its own ServiceAccount. It can reconcile and delete Project
Namespaces and their official OpenShell Helm releases but does not pass those
credentials to runtime workloads.

For Helm upgrades, `control.deletionWorker` has been replaced by
`control.worker`; move any replica, resource, or extra environment overrides to
the new key before upgrading.
