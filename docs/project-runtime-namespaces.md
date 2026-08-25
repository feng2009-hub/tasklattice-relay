# Project Runtime Namespaces

TaskLattice Relay maps every Project to one Kubernetes Namespace. The mapping is
stored in PostgreSQL as a `ProjectRuntimeTarget`; Kubernetes remains the runtime
execution target rather than a second product control plane.

## Creation and repair model

Project creation is synchronous:

1. Relay creates the Project and its runtime-target mapping in PostgreSQL.
2. Before returning a successful API response, the Control Plane uses
   server-side apply to ensure that the mapped Namespace exists with the
   Relay-owned labels and annotations.
3. If Namespace creation fails, Project creation fails and Relay compensates by
   deleting the new database Project.

The independent Control Worker also reconciles active Runtime Targets in the
background. A PostgreSQL-backed durable queue provides retries, exponential
backoff, delayed execution, and safe work distribution across Worker replicas.
The periodic maintenance task fans out one idempotent job per stale Project;
it does not reconcile the entire platform in one long-running job.

An operator can still repair historical or partially created mappings with the
one-shot command packaged in the Control Plane image:

```bash
kubectl -n <control-namespace> exec deployment/<release>-control -- \
  node apps/control/.output/tools/project-runtime-reconcile.mjs
```

The command checks every active Project sequentially, creates or repairs its
Namespace, prints a summary, and exits. It returns a non-zero exit code if any
Project fails. It can also be run from a built source checkout with:

```bash
npm run reconcile:project-runtime --workspace @tali/control
```

PostgreSQL and Kubernetes cannot participate in one atomic transaction. The
Worker therefore treats PostgreSQL as desired state, uses server-side apply,
and records `generation`, `observed_generation`, status, the last error, and
the last successful reconciliation. A stale job cannot mark a newer generation
ready. The periodic Worker or the one-shot command repairs a partial result
after a process or Kubernetes API failure.

## Why this is not a CRD

The current lifecycle is deliberately implemented as database-backed desired
state plus a small Kubernetes adapter. The Project API, authorization, and
audit trail stay in the existing Control Plane. A CRD would add another public
API, RBAC surface, versioned schema, status path, finalizer, webhook/upgrade
story, and source-of-truth decision without adding useful behavior at this
stage.

Introduce a CRD later only if Kubernetes-native clients must create or observe
Projects without going through Relay, multiple controllers need to reconcile
the same target, or GitOps ownership of Project lifecycle becomes a product
requirement. `ProjectRuntimeTarget` already separates desired state from the
Kubernetes adapter, so that migration would not require changing the Project
domain model.

## Namespace identity and scope

Namespace names use an opaque, deterministic 80-bit SHA-256 identifier encoded
as lowercase Base32, for example `tp-k7m2p5cx4v6dq2rw`. The fixed `tp-` prefix
makes the result exactly 19 characters. This lets the same identifier serve as
the Kubernetes Namespace and OpenShell Workspace while satisfying OpenShell's
DNS-routable name limit.

The Namespace also contains:

- `tali.io/project-id` annotation: the exact Project ID used for ownership
  checks.
- `tali.io/project-name` annotation: the exact, human-readable Project name.
- `tali.io/project-name` label: a DNS-safe normalized Project name for listing
  and filtering. Names that cannot be represented as a useful DNS label receive
  a stable hashed fallback.

Labels are discovery metadata, not identity. Relay refuses to adopt or delete
an existing Namespace whose owner annotation does not match the database
mapping. A Kubernetes UID precondition also prevents deleting a Namespace that
was recreated between the ownership check and delete request.

This phase creates only the Namespace. It does not inject a ServiceAccount,
`LimitRange`, `ResourceQuota`, or `NetworkPolicy`. Those objects change workload
admission and networking behavior and should be introduced later as explicit,
independently configurable Project policies.

The main Control Plane ServiceAccount can get, create, and patch Namespaces for
synchronous creation and direct managed-workload operations. The independent
Control Worker has a separate identity that can get, create, patch, and delete
Project Namespaces. Runtime workloads receive neither identity.

## Configuration

Configure Namespace creation under **Platform Setting -> Infrastructure**. The
Helm `projectRuntimeNamespaces` values provide the initial setting for a new
database only; they are not written to `control.toml` and later Helm upgrades
do not replace the saved Platform configuration. The Chart always installs the
reviewed Control and cleanup RBAC so a Platform Administrator can validate and
enable the feature without another deployment.

Before save, validation confirms that the in-cluster Kubernetes API is
available and uses SelfSubjectAccessReview to check the Control
ServiceAccount's required Namespace and managed workload permissions. It also
rejects a cluster ID that differs from any existing Runtime Target.

Runtime Namespace names are derived from the Project ID and are not
configurable. The database enforces uniqueness before Relay creates the
Namespace.

The adapter is in-cluster only. It refuses to create or delete a target whose
stored `cluster_id` differs from the current configuration, preventing an
accidental cluster switch from acting on a same-named Namespace. Moving targets
between clusters requires an explicit data-plane migration.

When the feature is disabled, Relay still stores the runtime-target mapping but
does not create or delete a Namespace. Background maintenance does not enqueue
Namespace reconciliation jobs until the saved Platform setting enables the
feature. This keeps local development independent from Kubernetes and
preserves the desired mapping for a later rollout.

## Current OpenShell boundary

The current Relay deployment keeps OpenShell `0.0.106` in its default `shared`
workspace mode, so the sandbox Namespace remains a Gateway-level setting.
Consequently, a `ready` Project Runtime Target currently means that the Project
Namespace mapping exists; it does **not** mean existing OpenClaw or Hermes
sandboxes have moved into it.

Repository-managed A2A Agent Deployments can target the mapped Namespace
directly. Moving OpenShell-backed instances requires either an upstream
per-sandbox Namespace option or one OpenShell Gateway per isolation boundary.
That runtime placement change must land before Namespace separation can be
described as complete workload isolation.
