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

There is no continuously running Project Runtime worker, database lease,
backoff loop, or periodic drift repair. Namespace creation is idempotent, so an
operator can repair historical or partially created mappings with the one-shot
command packaged in the Control Plane image:

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

PostgreSQL and Kubernetes cannot participate in one atomic transaction. A
process crash at the boundary between those systems can therefore still leave
a partial result; rerunning the one-shot command repairs that rare case.

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

Namespace names use the configured installation prefix and an opaque,
deterministic SHA-256 hash of the Project ID, for example
`acme-relay-p-2d218f...`. This is the stable identity and avoids collisions with
unrelated cluster resources. The prefix must be unique when multiple Relay
installations share one cluster.

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

The main Control Plane ServiceAccount can only get, create, and patch
Namespaces for synchronous creation and manual repair. The existing deletion
worker uses a separate identity limited to getting and deleting Namespaces.
Runtime workloads receive neither identity.

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

The Namespace prefix defaults to `tali-p`, but a shared cluster should use an
installation-specific value such as `acme-relay-p`.
Prefixes are validated as DNS labels and limited to 20 characters so the full
Namespace name remains within Kubernetes' 63-character limit.

The adapter is in-cluster only. It refuses to create or delete a target whose
stored `cluster_id` differs from the current configuration, preventing an
accidental cluster switch from acting on a same-named Namespace. Moving targets
between clusters requires an explicit data-plane migration.

When the feature is disabled, Relay still stores the runtime-target mapping but
does not create or delete a Namespace. This keeps local development independent
from Kubernetes and preserves the desired mapping for a later rollout.

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
