# Project Runtime Namespaces

TaskLattice Relay maps every Project to one Kubernetes Namespace. The mapping is
stored in PostgreSQL as a `ProjectRuntimeTarget`; Kubernetes remains the runtime
execution target rather than a second product control plane.

## Why this is not a CRD

The current lifecycle is deliberately implemented as database-backed desired
state plus a small reconciler:

1. Project creation inserts a pending `ProjectRuntimeTarget` in the same
   database transaction.
2. The Project Runtime Controller claims pending work with a database lease.
3. It uses Kubernetes server-side apply to reconcile the Namespace baseline,
   and periodically re-applies it to repair drift or propagate policy changes.
4. Project deletion removes external resources first, deletes the Namespace,
   waits for it to disappear, and only then removes the Project tombstone.

The controller refuses to adopt or delete an existing Namespace whose
`tali.io/project-id` owner annotation does not match the database mapping. A
Kubernetes UID precondition also prevents deleting a Namespace that was
recreated between the ownership check and delete request.

This keeps the Project API, authorization, audit trail, and retry state in the
existing Control Plane. A CRD would add another public API, RBAC surface,
versioned schema, status reconciliation path, finalizer, webhook/upgrade story,
and source-of-truth decision without adding useful behavior at this stage.

Introduce a CRD later only if Kubernetes-native clients must create or observe
Projects without going through Relay, multiple controllers need to reconcile
the same runtime target, or GitOps ownership of Project lifecycle becomes a
product requirement. `ProjectRuntimeTarget` already separates desired state
from the Kubernetes adapter, so that migration does not require changing the
Project domain model.

## Namespace identity and baseline

Namespace names use the configured prefix and an opaque deterministic hash of
the Project ID, for example `tali-p-2d218f...`. A mutable Project display name
is never used as Kubernetes identity and the raw Project ID is retained in the
Namespace annotation `tali.io/project-id`.

Each managed Namespace contains:

- `tali-agent-runtime` ServiceAccount with token automount disabled;
- a Container `LimitRange`;
- an optional `ResourceQuota`;
- optional default-deny ingress and egress `NetworkPolicy`;
- same-Project traffic, DNS egress, and traffic to/from the Relay platform
  Namespace when default-deny networking is enabled.

The Project Runtime Controller has cluster-scoped permission only for
Namespaces and these baseline resource kinds. The deletion worker uses a
separate identity limited to reading and deleting Namespaces. Runtime workloads
should use the Namespace-bound ServiceAccount and must not receive either
controller identity.

## Configuration

Helm enables the controller with `projectRuntimeNamespaces.enabled`. Quotas,
default limits, network policy, reconciliation interval, deletion timeout,
cluster identifier, and Namespace prefix are configured under
`projectRuntimeNamespaces` in `values.yaml`. The corresponding Control Plane
TOML section is `[runtime_namespaces]`.

The current adapter is deliberately in-cluster only. A worker refuses to
reconcile or delete a target whose stored `cluster_id` differs from its own
configuration, preventing an accidental cluster switch from acting on a
same-named Namespace. Moving targets between clusters requires an explicit
data-plane migration.

Turning the controller off stops reconciliation and Namespace deletion, but
the database mapping is still created. This preserves the desired state for a
later rollout and keeps local development independent from Kubernetes.

## Current OpenShell boundary

With the pinned OpenShell `0.0.106`, the sandbox Namespace is a static Gateway
setting (`server.sandboxNamespace`), not an option accepted per sandbox create.
Consequently, a `ready` Project Runtime Target currently means that the Project
Namespace baseline exists; it does **not** mean existing OpenClaw or Hermes
sandboxes have moved into it.

Repository-managed A2A Agent Deployments can target the mapped Namespace
directly. Moving OpenShell-backed instances requires either an upstream
per-sandbox Namespace option or one OpenShell Gateway per isolation boundary.
That runtime placement change must land before Namespace separation can be
described as complete workload isolation.
