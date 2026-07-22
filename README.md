# TaskLattice

TaskLattice is a Kubernetes control plane for registering model Providers and
running OpenClaw or Hermes Agents in OpenShell sandboxes. OpenShell is the fixed
runtime; OpenClaw is the default Agent implementation and Hermes is the second
supported implementation.

```text
Browser (TanStack Start + shadcn/ui)
                  |
                  | REST + WebSocket
                  v
TaskLattice Control API ---- LiteLLM ---- Provider API
          |                    |
          |                    `---- PostgreSQL
          v
TaskLattice OpenShell Runner
          |
          | OpenShell CLI / gRPC
          v
OpenShell Gateway ---- Agent Sandbox CR
                           |
                           `---- Sandbox Pod + workspace PVC
                                 (OpenClaw or Hermes)
```

## Install the latest Release

The default installation target is the
[latest published GitHub Release](https://github.com/Sn0rt/TaskLattice/releases/latest).
Set `VERSION` to that Release version without its leading `v`. The Chart and
all five first-party images then use that exact immutable version; TaskLattice
does not deploy the floating `latest` image tag.

Download the self-contained Chart attached to the Release:

```sh
VERSION="<latest-release-version>"
curl --fail --location --remote-name \
  "https://github.com/Sn0rt/TaskLattice/releases/download/v${VERSION}/tasklattice-${VERSION}.tgz"
helm upgrade --install tasklattice "./tasklattice-${VERSION}.tgz" \
  --namespace tasklattice-sandboxes \
  --create-namespace \
  --wait \
  --timeout 10m
```

The same Chart is published to GHCR as an OCI artifact:

```sh
VERSION="<latest-release-version>"
helm upgrade --install tasklattice \
  oci://ghcr.io/sn0rt/charts/tasklattice \
  --version "${VERSION}" \
  --namespace tasklattice-sandboxes \
  --create-namespace \
  --wait \
  --timeout 10m
```

Requirements:

- Kubernetes 1.29 or newer.
- Helm and `kubectl`.
- Access to GHCR and the public upstream registries.
- A default `ReadWriteOnce` StorageClass.
- Credentials or an endpoint for at least one supported model Provider.
- At least 4 CPU and 8 GiB memory for a practical single-Instance deployment.

Verify the installation:

```sh
kubectl -n tasklattice-sandboxes rollout status deployment/tasklattice-control --timeout=300s
kubectl -n tasklattice-sandboxes rollout status deployment/tasklattice-runner --timeout=300s
kubectl -n tasklattice-sandboxes rollout status deployment/tasklattice-litellm --timeout=300s
kubectl -n tasklattice-sandboxes rollout status statefulset/tasklattice-postgresql --timeout=300s
kubectl -n tasklattice-sandboxes rollout status statefulset/tasklattice-openshell --timeout=300s
kubectl -n agent-sandbox-system rollout status deployment/agent-sandbox-controller --timeout=300s
kubectl -n tasklattice-sandboxes get pods,services,pvc
```

## Images and versions

TaskLattice publishes five first-party images. A packaged Release Chart sets
its `appVersion` to the Release version, and every empty first-party image tag
resolves to that exact value.

| Component                | Released image or version                                       | Purpose                                            |
| ------------------------ | --------------------------------------------------------------- | -------------------------------------------------- |
| TaskLattice control      | `ghcr.io/sn0rt/tasklattice-control:<release>`                   | UI, REST/WebSocket API, and SQLite control data    |
| Runtime runner           | `ghcr.io/sn0rt/tasklattice-openshell-runner:<release>`          | OpenShell sandbox lifecycle and terminal relay     |
| LiteLLM                  | `ghcr.io/sn0rt/tasklattice-litellm:<release>`                   | Model gateway, virtual keys, and spend attribution |
| OpenClaw sandbox         | `ghcr.io/sn0rt/tasklattice-nemoclaw-sandbox:<release>`          | Default Agent sandbox                              |
| Hermes sandbox           | `ghcr.io/sn0rt/tasklattice-nemoclaw-hermes-sandbox:<release>`   | Hermes Agent sandbox                               |
| LiteLLM PostgreSQL       | `postgres:17-alpine`                                            | LiteLLM configuration and usage data               |
| OpenShell gateway        | `ghcr.io/nvidia/openshell/gateway:0.0.82`                       | Policy enforcement, audit, exec, and HTTP routing  |
| OpenShell supervisor     | `ghcr.io/nvidia/openshell/supervisor:0.0.82`                    | Supervisor injected into Agent sandboxes           |
| Agent Sandbox controller | `registry.k8s.io/agent-sandbox/agent-sandbox-controller:v0.5.1` | Sandbox CR, Pod, and workspace PVC lifecycle       |

The OpenShell supervisor and selected Agent image are pulled when an Instance
creates its Sandbox rather than running as permanent control-plane Pods.

## Access

On a cluster with `LoadBalancer` support, open the external address of the
`tasklattice-control` Service on port 80. Otherwise run these forwards in two
terminals and open `http://127.0.0.1:18080`:

```sh
kubectl -n tasklattice-sandboxes port-forward service/tasklattice-control 18080:80
```

```sh
kubectl -n tasklattice-sandboxes port-forward service/tasklattice-openshell 8080:8080
```

The checked-in Chart defaults are suitable only for a trusted cluster: local
login is `admin / admin`, and OpenShell permits unauthenticated plaintext
gateway clients. Before shared or internet-facing use, override every
`secrets.*` value and configure authenticated ingress plus OpenShell TLS/OIDC.
See the [Chart documentation](charts/tasklattice/README.md) for existing
Secrets, image pull Secrets, and external runtime settings.

## First Instance

After signing in:

1. Register a Provider and validate at least one model.
2. Create an Inference Group using a registered LiteLLM public model alias.
3. Mark the first Inference Group as the default for new Instances.
4. Create an Instance, choose OpenClaw or Hermes, and select a ready Inference
   Group.
5. Keep the built-in Unrestricted Policy for the first validation run.

A successful Instance reaches `READY`, exposes its Agent UI, and enables its
terminal. Each Instance receives an isolated LiteLLM virtual key and an
OpenShell Sandbox with its own workspace PVC.

## Persistence and uninstall

The control SQLite database, LiteLLM PostgreSQL data, OpenShell gateway data,
and Agent workspaces use PVCs. Restarting Pods does not reset that state.

Delete active Instances and back up required data before uninstalling:

```sh
kubectl -n tasklattice-sandboxes get sandboxes,pvc
helm uninstall tasklattice --namespace tasklattice-sandboxes
```

StatefulSet claim-template PVCs, dynamically created workspace PVCs, Sandbox
resources, and CRDs may remain after Helm uninstall. Review them explicitly
before removal.

Additional design documentation:

- [Image release and Helm publishing](docs/image-release-and-helm.md)
- [OpenShell Kubernetes runtime](docs/openshell-kubernetes-runtime.md)
- [MVP core flow](docs/mvp-core-flow.md)

## License

TaskLattice is licensed under the [Apache License 2.0](LICENSE). It permits
commercial use, modification, and distribution subject to the terms of the
license.
