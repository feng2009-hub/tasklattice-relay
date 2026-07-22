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

This README covers two supported deployment paths:

- **GitHub Release + Helm** is the shortest path for a cluster that can pull
  released images from GHCR.
- **Local source build + Kustomize** is the development path validated with
  OrbStack, whose Kubernetes cluster shares locally built Docker images and
  exposes `LoadBalancer` Services on localhost.

Other clusters work as long as their nodes can pull the configured images and
provide a default `ReadWriteOnce` StorageClass.

## What gets installed

| Component | Released image or version | Purpose and state |
| --- | --- | --- |
| TaskLattice control | `ghcr.io/sn0rt/tasklattice-control:<release>` | UI and API; SQLite at `/data/tasklattice.db` on a control PVC |
| Runtime runner | `ghcr.io/sn0rt/tasklattice-openshell-runner:<release>` | Creates, observes, opens terminals to, and destroys OpenShell sandboxes |
| LiteLLM | `ghcr.io/sn0rt/tasklattice-litellm:<release>` | Model gateway, per-Instance keys, and spend attribution |
| LiteLLM PostgreSQL | `postgres:17-alpine` | LiteLLM configuration and usage data on its StatefulSet PVC |
| OpenShell gateway | `ghcr.io/nvidia/openshell/gateway:0.0.82` | Policy enforcement, audit logs, exec relay, and HTTP service routing |
| OpenShell supervisor | `ghcr.io/nvidia/openshell/supervisor:0.0.82` | Supervisor injected into dynamically created Agent sandboxes |
| Agent Sandbox controller | `registry.k8s.io/agent-sandbox/agent-sandbox-controller:v0.5.1` | Kubernetes Sandbox CR, Pod, and workspace PVC lifecycle |
| OpenClaw sandbox | `ghcr.io/sn0rt/tasklattice-nemoclaw-sandbox:<release>` | Default Agent image built from pinned NemoClaw source |
| Hermes sandbox | `ghcr.io/sn0rt/tasklattice-nemoclaw-hermes-sandbox:<release>` | Hermes Agent image with the OpenShell-compatible UID and configuration overlay |

TaskLattice publishes five first-party images. A complete deployment with both
Agent implementations running uses nine unique images: those five plus
PostgreSQL, the OpenShell gateway and supervisor, and the Agent Sandbox
controller. The supervisor and selected Agent image are pulled when an Instance
creates its Sandbox, not as permanent control-plane Pods.

Prisma is embedded in the LiteLLM image and runs LiteLLM's database generation
and migration workflow. It is a library/CLI dependency, not a separate Pod.

The pinned NemoClaw revisions, base-image digests, and platform-specific build
logic are in [`scripts/build-nemoclaw-sandbox.sh`](scripts/build-nemoclaw-sandbox.sh).
The OpenShell and Agent Sandbox pins are in
[`scripts/install-openshell-k8s.sh`](scripts/install-openshell-k8s.sh).

See [`docs/image-release-and-helm.md`](docs/image-release-and-helm.md) for the
five-image build graph and tag-driven GitHub Actions release internals.

## Install from a GitHub Release

Choose a published version from
[GitHub Releases](https://github.com/Sn0rt/TaskLattice/releases), then download
the self-contained chart attached to that Release:

```sh
VERSION="<release-version>"
curl --fail --location --remote-name \
  "https://github.com/Sn0rt/TaskLattice/releases/download/v${VERSION}/tasklattice-${VERSION}.tgz"
helm upgrade --install tasklattice "./tasklattice-${VERSION}.tgz" \
  --namespace tasklattice-sandboxes \
  --create-namespace \
  --wait \
  --timeout 10m
```

The same chart is published to GHCR:

```sh
VERSION="<release-version>"
helm upgrade --install tasklattice \
  oci://ghcr.io/sn0rt/charts/tasklattice \
  --version "${VERSION}" \
  --namespace tasklattice-sandboxes \
  --create-namespace \
  --wait \
  --timeout 10m
```

The Helm path requires Kubernetes 1.29+, `kubectl`, Helm, access to GHCR and
the public upstream registries, a default `ReadWriteOnce` StorageClass, and
credentials or an endpoint for at least one supported model Provider. A 4 CPU /
8 GiB cluster is a practical minimum for one 2 GiB Agent Sandbox.

Verify the installation:

```sh
kubectl -n tasklattice-sandboxes rollout status deployment/tasklattice-control --timeout=300s
kubectl -n tasklattice-sandboxes rollout status deployment/tasklattice-runner --timeout=300s
kubectl -n tasklattice-sandboxes rollout status deployment/tasklattice-litellm --timeout=300s
kubectl -n tasklattice-sandboxes rollout status statefulset/tasklattice-postgresql --timeout=300s
kubectl -n tasklattice-sandboxes rollout status statefulset/tasklattice-openshell --timeout=300s
kubectl -n agent-sandbox-system rollout status deployment/agent-sandbox-controller --timeout=300s
kubectl -n tasklattice-sandboxes get pods,service,pvc
```

On a local cluster with `LoadBalancer` support, open the control Service address
on port 80. If external addresses remain pending, run one forward in each of
two terminals and use `http://127.0.0.1:18080`:

```sh
# Terminal 1
kubectl -n tasklattice-sandboxes port-forward service/tasklattice-control 18080:80
```

```sh
# Terminal 2
kubectl -n tasklattice-sandboxes port-forward service/tasklattice-openshell 8080:8080
```

The chart defaults are intentionally suitable only for a trusted development
cluster: local login is `admin / admin`, and OpenShell uses plaintext with
unauthenticated gateway clients. Before shared or internet-facing use, override
every `secrets.*` value and configure authenticated ingress plus OpenShell
TLS/OIDC. See [`charts/tasklattice/README.md`](charts/tasklattice/README.md) for
private GHCR pull Secrets, existing Secrets, and external runtime overrides.

## Build and deploy from source

### Prerequisites

Install and start all of the following for the local source-build path:

- Git and outbound access to GitHub, Docker Hub, GHCR, and the npm registry.
- Node.js 22 or newer and npm.
- Docker with BuildKit support.
- A Kubernetes 1.29+ cluster with a default `ReadWriteOnce` StorageClass.
- `kubectl`, configured for the target cluster.
- Helm, `curl`, and `tar`.
- Credentials or an endpoint for a supported Provider. The catalog includes
  hosted APIs, cloud platforms, self-hosted Ollama/vLLM, and custom OpenAI- or
  Anthropic-compatible endpoints.
- Enough local capacity for OpenShell, LiteLLM, PostgreSQL, and at least one
  2 GiB Agent sandbox. A 4 CPU / 8 GiB cluster is a practical minimum for one
  Instance; more memory is preferable while building and testing both Agents.

Verify the toolchain and the selected cluster before making any changes:

```sh
node --version
npm --version
docker version
kubectl version --client
helm version --short
kubectl config current-context
kubectl get nodes
```

The commands below assume a Docker image store shared with the Kubernetes node,
as provided by OrbStack. For kind, minikube, k3d, or a remote cluster, load or
push these local images before deploying:

```text
tasklattice-control:0.2.0
tasklattice-openshell-runner:0.2.0
tasklattice-litellm:0.2.0
tasklattice-nemoclaw-sandbox:0.3.0
tasklattice-nemoclaw-hermes-sandbox:0.3.0
```

### Deploy from a clean checkout

#### 1. Clone and validate the source tree

```sh
git clone git@github.com:Sn0rt/TaskLattice.git
cd TaskLattice
npm ci
npm test
npm run typecheck
```

The Kubernetes deployment does not read the repository's `.env` file. Create
one only when running the control API or runner directly on the host:

```sh
cp .env.example .env
```

Never commit `.env`. The local Kubernetes overlay generates development-only
control authentication, runner, LiteLLM, and PostgreSQL Secrets from
[`infra/kubernetes/overlays/openshell/kustomization.yaml`](infra/kubernetes/overlays/openshell/kustomization.yaml).
Replace that mechanism with managed Secrets before using a shared cluster.

#### 2. Build every required local image

Build the control plane, runner, LiteLLM, OpenClaw, and Hermes images before
creating the Kubernetes workloads:

```sh
npm run images:build
```

The sandbox builds clone pinned NVIDIA NemoClaw revisions. The Hermes build
first attempts the pinned GHCR base and builds the pinned local base fallback
when that artifact is unavailable to the current account. A denied GHCR base
message is therefore not fatal if the fallback build completes and the final
image is present.

Confirm all five TaskLattice images exist:

```sh
docker image ls tasklattice-control:0.2.0
docker image ls tasklattice-openshell-runner:0.2.0
docker image ls tasklattice-litellm:0.2.0
docker image ls tasklattice-nemoclaw-sandbox:0.3.0
docker image ls tasklattice-nemoclaw-hermes-sandbox:0.3.0
```

Individual build commands are available for shorter development loops:

```sh
npm run images:build:control
npm run images:build:runner
npm run images:build:litellm
npm run images:build:sandbox:openclaw
npm run images:build:sandbox:hermes
```

#### 3. Install the sandbox runtime

The installer adds the Agent Sandbox controller, then installs the pinned
OpenShell Helm chart in the `openshell` namespace:

```sh
npm run k8s:install-openshell
```

The local OpenShell chart intentionally disables gateway TLS and allows
unauthenticated gateway clients. Use it only on a trusted local cluster.

Verify the runtime before installing TaskLattice:

```sh
kubectl -n agent-sandbox-system rollout status deployment/agent-sandbox-controller --timeout=180s
kubectl -n openshell rollout status statefulset/openshell --timeout=180s
kubectl -n agent-sandbox-system get pods
kubectl -n openshell get pods,service
```

#### 4. Deploy TaskLattice, LiteLLM, and PostgreSQL

Use the `openshell` overlay for the real Pod-backed Agent runtime:

```sh
npm run k8s:deploy:openshell
```

Do not apply `infra/kubernetes/base` by itself for this workflow. The overlay
adds the runner, LiteLLM, PostgreSQL, and the generated Secrets required by the
base control Deployment.

Wait for every workload:

```sh
kubectl -n tasklattice-sandboxes rollout status statefulset/tasklattice-litellm-postgres --timeout=300s
kubectl -n tasklattice-sandboxes rollout status deployment/tasklattice-litellm --timeout=300s
kubectl -n tasklattice-sandboxes rollout status deployment/tasklattice-openshell-runner --timeout=300s
kubectl -n tasklattice-sandboxes rollout status deployment/tasklattice-control --timeout=300s
kubectl -n tasklattice-sandboxes get pods,service,pvc
```

The `local` and `openshell` development overlays enable the reusable
`litellm-admin-loadbalancer` component. It keeps the in-cluster DNS name used by
TaskLattice and also exposes LiteLLM's management UI through a LoadBalancer:

```bash
kubectl -n tasklattice-sandboxes get service tasklattice-litellm \
  -o jsonpath='{.status.loadBalancer.ingress[0].ip}'
```

Open `http://<load-balancer-address>:4000/ui` and sign in with the development
credentials `admin` / `tasklattice-local-admin`. LoadBalancer address assignment
depends on the local Kubernetes implementation and may remain pending when no
LoadBalancer controller is installed. The reusable LiteLLM base stays
ClusterIP-only; remove the component from a development overlay to disable
external management access.

On OrbStack, both LoadBalancer Services are reachable without port-forwarding:

```sh
kubectl -n tasklattice-sandboxes get service tasklattice-control
kubectl -n openshell get service openshell
curl --fail http://localhost/api/health
```

The health response must include:

```json
{"ok":true,"runtime":"openshell"}
```

Open the control console at [http://localhost](http://localhost). The local-only
login is `admin / admin`. The local overlays supply the bcrypt password hash and
JWT signing value through the reusable
[`local-auth` Kustomize component](infra/kubernetes/components/local-auth/kustomization.yaml).
These checked-in credentials are only for a trusted local cluster; never expose
this deployment to an untrusted network.

If `EXTERNAL-IP` remains `Pending`, the cluster does not provide a
LoadBalancer implementation. Install one, use a cluster-specific tunnel, or
run one Service forward in each of two terminals:

```sh
# Terminal 1
kubectl -n tasklattice-sandboxes port-forward service/tasklattice-control 18080:80
```

```sh
# Terminal 2
kubectl -n openshell port-forward service/openshell 8080:8080
```

With that fallback, use `http://127.0.0.1:18080` for the control console and
validation base URL. The OpenShell forward must remain on port 8080 because
per-Instance URLs use `http://<sandbox>--webui.openshell.localhost:8080/`.

#### 5. Register a Provider, models, and an Inference Group

An Instance requires a `READY` Inference Group backed by a model alias already
registered in LiteLLM. There is no automatic legacy Provider seed.

1. Sign in and open **Providers**.
2. Select **Register Provider**.
3. Choose a Provider from the catalog. It includes hosted APIs such as OpenAI,
   Anthropic, Gemini, DeepSeek, Qwen, Moonshot/Kimi, Z.AI, MiniMax, NVIDIA NIM,
   and OpenRouter; cloud integrations for Azure OpenAI, AWS Bedrock, and Vertex
   AI; self-hosted Ollama and vLLM; and custom OpenAI- or
   Anthropic-compatible endpoints.
4. Enter the Provider-specific credentials and configuration. Some adapters
   supply a fixed Endpoint, while cloud, regional, self-hosted, and custom
   adapters require additional fields.
5. Select **Validate key & configure**.
6. Confirm that the Endpoint, credential, and model-catalog checks pass and at
   least one model appears as `VALIDATED`.

TaskLattice stores credentials server-side and never returns them to the
browser. Discovery is adapter-specific: OpenAI-compatible Providers query
`<endpoint>/models`, Ollama queries `/api/tags`, and Providers without a
reliable remote catalog offer curated or manual model/deployment IDs. Selected
models are validated and registered in LiteLLM.

After registering the model:

1. Open **Providers > Inference Groups** and select **Create inference group**.
2. Enter a name and an existing LiteLLM public model alias.
3. Keep **Default for new Instances** enabled for the first group.
4. Create the group and confirm that its status is `READY`.

The group is the stable inference contract used by Instances. TaskLattice
validates its Gateway and compliance metadata, applies the default group to new
Instances, and issues an isolated LiteLLM Virtual Key for each Instance.

Deleting a Provider Account unregisters its LiteLLM models. Before deleting
one, move or remove any Inference Group that depends on those public aliases.

#### 6. Create the first Instance

1. Open **Instances** and select **Create Instance**.
2. Under **Identity & Capabilities**, enter the Agent name, choose an Agent
   Role, review its system instructions, and optionally add Skills, MCP servers,
   and Knowledge sources.
3. Under **Runtime & Inference**, select an Agent implementation: **OpenClaw**
   is the default and **Hermes** is also supported. OpenShell is the fixed
   runtime, not a selectable Agent.
4. Confirm that the intended default or explicitly selected Inference Group is
   `READY`. TaskLattice supplies its endpoint, public model alias, and isolated
   Virtual Key automatically.
5. Keep the built-in **Unrestricted** Policy for the first run. It is the
   deployment default and is immutable in the Policy UI.
6. Complete **Review & Approve** to start provisioning.

The Instance remains visible while it moves through `PROVISIONING` stages. A
successful run reaches `READY`, exposes the Agent Web UI or Hermes dashboard,
and enables its full-screen TUI. OpenShell creates the same-name Sandbox Pod
and workspace PVC in its configured Sandbox namespace: `openshell` for the
local Kustomize path and the Helm release namespace (`tasklattice-sandboxes` in
the commands above) for the released chart.

Inspect the local Kustomize runtime while provisioning:

```sh
kubectl -n openshell get sandboxes,pods,pvc
kubectl -n tasklattice-sandboxes logs deployment/tasklattice-openshell-runner --tail=200
kubectl -n openshell logs statefulset/openshell --tail=200
```

For the released Helm chart, use:

```sh
kubectl -n tasklattice-sandboxes get sandboxes,pods,pvc
kubectl -n tasklattice-sandboxes logs deployment/tasklattice-runner --tail=200
kubectl -n tasklattice-sandboxes logs statefulset/tasklattice-openshell --tail=200
```

Each Instance gets an isolated LiteLLM Virtual Key scoped through its Inference
Group. Its effective OpenShell Policy adds the configured inference Endpoint
and the Kubernetes service suffix
`**.svc.cluster.local` on that Endpoint's port. Private Service CIDRs come from
`OPENSHELL_KUBERNETES_SERVICE_CIDRS`; update the runner Deployment if the
cluster uses a non-RFC1918 Service network.

Deleting an Instance first marks it `DESTROYING`, then removes its OpenShell
Sandbox, routed HTTP endpoint, Pod, and workspace PVC before removing it from
the active list.

## Development workflows

### Host-only control contract

Use the fixture runner when changing API or UI contracts without running an
Agent Pod:

```sh
cp .env.example .env
```

Terminal 1:

```sh
NEMOCLAW_RUNNER_MODE=fixture npm run dev:runner
```

Terminal 2:

```sh
DATABASE_PATH=/tmp/tasklattice.db PORT=18080 npm run dev:control
```

On first startup, the control service creates SQLite tables for Skills, MCP
servers, Knowledge sources, and Agent Role mappings. With
`TALI_EXTENSION_CATALOG_SEED=development` (the development and local Kubernetes
default), missing catalog records are inserted without overwriting records that
operators have already changed. Set the value to `none` to disable bootstrap
seeding for a deployment-managed catalog.

### Rebuild and roll out changed code

All local manifests use stable tags with `imagePullPolicy: IfNotPresent`.
Rebuilding an image does not change an already-running Pod. Rebuild the relevant
image and restart its workload:

```sh
# UI or control API
npm run images:build:control
kubectl -n tasklattice-sandboxes rollout restart deployment/tasklattice-control
kubectl -n tasklattice-sandboxes rollout status deployment/tasklattice-control

# Runtime runner
npm run images:build:runner
kubectl -n tasklattice-sandboxes rollout restart deployment/tasklattice-openshell-runner
kubectl -n tasklattice-sandboxes rollout status deployment/tasklattice-openshell-runner

# LiteLLM wrapper
npm run images:build:litellm
kubectl -n tasklattice-sandboxes rollout restart deployment/tasklattice-litellm
kubectl -n tasklattice-sandboxes rollout status deployment/tasklattice-litellm
```

Rebuilding an Agent sandbox image affects newly created sandboxes. Delete and
recreate an existing development Instance when testing a new OpenClaw or Hermes
image.

## Persistent state and cleanup

Both deployment paths preserve the control SQLite database, LiteLLM PostgreSQL
data, the OpenShell gateway database, and per-Instance workspaces on PVCs.
Deleting or restarting a Pod does not reset that state; deleting a PVC does.

The released Helm chart keeps TaskLattice, OpenShell, Sandbox CRs, Agent Pods,
and their PVCs in `tasklattice-sandboxes`. The Agent Sandbox controller remains
in `agent-sandbox-system`. Inspect generated PVC names before uninstalling:

```sh
kubectl -n tasklattice-sandboxes get pvc
helm uninstall tasklattice --namespace tasklattice-sandboxes
```

Before uninstalling, delete active Instances through TaskLattice and back up the
control SQLite PVC. Helm deletes the chart-managed control PVC, while
StatefulSet claim-template PVCs are normally retained. Dynamically created
Sandbox workspace PVCs and the vendored Agent Sandbox CRDs are not Helm release
objects. Review every retained PVC and Sandbox CR explicitly before removing
them.

The local Kustomize path keeps TaskLattice resources in
`tasklattice-sandboxes`, OpenShell and Agent workspaces in `openshell`, control
SQLite in `tasklattice-control-data`, and LiteLLM PostgreSQL in
`data-tasklattice-litellm-postgres-0`.

Remove the TaskLattice OpenShell overlay with:

```sh
npm run k8s:delete:openshell
```

That command does not uninstall the OpenShell Helm release or Agent Sandbox
controller. Review PVCs and active Sandboxes before any full runtime reset.

## Troubleshooting

Unless a subsection says otherwise, the commands below use local Kustomize
workload names. For the default Helm release, substitute
`tasklattice-runner` for `tasklattice-openshell-runner`,
`tasklattice-postgresql` for `tasklattice-litellm-postgres`, and
`tasklattice-openshell` for `openshell`; Helm also runs OpenShell in
`tasklattice-sandboxes` instead of the separate `openshell` namespace.

### `ErrImagePull` or repeated `Pulling image`

Confirm the exact image exists in the node's image store:

```sh
docker image inspect tasklattice-nemoclaw-sandbox:0.3.0
docker image inspect tasklattice-nemoclaw-hermes-sandbox:0.3.0
kubectl -n openshell describe pod <sandbox-name>
```

If Docker and Kubernetes do not share an image store, push or load the image
into the cluster. A local host image alone is not enough for a remote node.

### `secret "tasklattice-litellm" not found`

The base manifests do not create local credentials. Deploy the complete
OpenShell overlay:

```sh
npm run k8s:deploy:openshell
```

### `TALI_AUTH_LOCAL_PASSWORD_HASH is required in production`

The control image runs with `NODE_ENV=production`, including on a local
cluster. Deploy the complete local or OpenShell overlay so the local auth
component generates `tasklattice-control-auth` and injects the password hash
and JWT signing value:

```sh
npm run k8s:deploy:openshell
kubectl -n tasklattice-sandboxes rollout status deployment/tasklattice-control --timeout=180s
```

Do not solve this by disabling the production check. For a shared environment,
replace the local component with a managed Secret and a unique password hash
and JWT signing value.

### LiteLLM remains unready

Wait for PostgreSQL first, then inspect both logs:

```sh
kubectl -n tasklattice-sandboxes logs statefulset/tasklattice-litellm-postgres --tail=200
kubectl -n tasklattice-sandboxes logs deployment/tasklattice-litellm --tail=200
```

### OpenClaw tools report `gateway closed (1006 abnormal closure)`

First confirm the error belongs to an OpenClaw Instance. A Hermes Sandbox has
`/sandbox/.hermes`, serves its API on port `8642`, and uses `18789` only for
the dashboard. An error that names `OPENCLAW_GATEWAY_URL` and
`/sandbox/.openclaw/openclaw.json` comes from an OpenClaw Sandbox.

For OpenClaw, compare the proxied and direct self-dialback health checks from
the Sandbox. Replace the Pod name and interface address with the live values:

```sh
kubectl -n openshell exec <openclaw-pod> -- \
  curl -i http://10.200.0.2:18789/health
kubectl -n openshell exec <openclaw-pod> -- \
  env NO_PROXY=10.200.0.2 no_proxy=10.200.0.2 \
  curl -i http://10.200.0.2:18789/health
```

A `policy_denied` response followed by `200` with the temporary bypass means
the Sandbox interface is missing from `NO_PROXY`. TaskLattice patches its
pinned NemoClaw OpenClaw image at build time so `_GATEWAY_WS_HOST` bypasses the
OpenShell HTTP proxy. Rebuild the OpenClaw image and recreate the development
Instance; existing Sandboxes retain their startup environment.

Do not use `openclaw doctor --fix` for this error. NemoClaw intentionally uses
group-shared configuration permissions that differ from OpenClaw's standalone
single-user recommendations.

### Hermes receives `Invalid proxy server token` from LiteLLM

Do not add the LiteLLM Service to every business Policy. TaskLattice enables
OpenShell `providers_v2_enabled` once at gateway scope, registers the shared
`tasklattice-litellm` Profile, and attaches one Provider containing a distinct
LiteLLM virtual key to each Instance. OpenShell then composes an isolated
`_provider_*` rule into that Sandbox's effective Policy.

Hermes must persist the dynamic `openshell:resolve:env:v..._OPENAI_API_KEY`
placeholder created for its attached Provider. It must not persist either the
real LiteLLM key or NemoClaw's static `sk-OPENSHELL-PROXY-REWRITE` template.
The bootstrap script performs this migration while updating Hermes' hash
anchor. Check the global switch, attachment, and composed Policy:

```sh
kubectl -n tasklattice-sandboxes exec deployment/tasklattice-openshell-runner -- \
  openshell settings get --global
kubectl -n tasklattice-sandboxes exec deployment/tasklattice-openshell-runner -- \
  openshell sandbox provider list <sandbox-name>
kubectl -n tasklattice-sandboxes exec deployment/tasklattice-openshell-runner -- \
  openshell policy get <sandbox-name> --full -o json
```

New Instances must use the `tasklattice-litellm` Provider type, and the full
Policy must contain its `_provider_*` entry for the exact LiteLLM host and
port. A legacy `openai` Provider stores a key but does not compose this custom
Profile. Rebuild the Runner and Hermes Sandbox images before creating another
Instance. An already-open Hermes TUI should be closed and reopened after a
live configuration migration.

LiteLLM runs Prisma migrations inside its own container; no Prisma Deployment
should appear in `kubectl get pods`.

### Managed inference is unavailable during Instance creation

Open **Providers** and confirm that the intended model is registered in LiteLLM.
Then open **Providers > Inference Groups** and confirm that exactly one default
group is configured and its status is `READY`. Refresh or validate the group if
its Gateway routing or compliance metadata changed. A validated Provider model
alone is not sufficient for Instance creation.

### OpenShell denies the LiteLLM request

Read the effective Policy and OCSF audit events from the runner Pod:

```sh
kubectl -n tasklattice-sandboxes exec deployment/tasklattice-openshell-runner -- \
  openshell policy get <sandbox-name> --full -o json
kubectl -n tasklattice-sandboxes exec deployment/tasklattice-openshell-runner -- \
  openshell logs <sandbox-name> --source sandbox --since 10m
```

For Kubernetes Services, verify that the effective rule includes
`**.svc.cluster.local`, the inference port, the Agent's canonical binary path,
and an `allowed_ips` CIDR covering the resolved Service IP.

### The UI still shows an old build

The manifests use stable image tags. Compare the Pod image ID with the rebuilt
local image, then restart the Deployment as shown in the development workflow.

### Instance deletion does not finish

Check the control and runner logs, then confirm whether the Sandbox, Pod, HTTP
service route, or PVC remains:

```sh
kubectl -n tasklattice-sandboxes logs deployment/tasklattice-control --tail=200
kubectl -n tasklattice-sandboxes logs deployment/tasklattice-openshell-runner --tail=200
kubectl -n openshell get sandboxes,pods,pvc
```

## Authentication and production boundary

Host development falls back to `admin / admin` when `NODE_ENV` is not
`production`. The local Kubernetes overlays run the production image and
explicitly configure the same local login through a bcrypt hash. Host
development can configure local authentication through `.env`:

```text
TALI_AUTH_MODE=local
TALI_AUTH_JWT_SECRET=<long random secret>
TALI_AUTH_LOCAL_USERNAME=admin
TALI_AUTH_LOCAL_PASSWORD=<local password>
```

`local-sso` additionally supports OIDC Authorization Code flow with PKCE,
nonce, discovery, and provider signing-key validation; see `.env.example` for
the variables.

Neither the checked-in Kubernetes overlay nor the Helm chart's default values
are a production deployment. Before using a shared environment, add
authenticated TLS for OpenShell, managed Secrets, ingress and DNS, per-tenant
namespaces and quotas, Kubernetes NetworkPolicies, durable runner operation
state, backup and restore for both databases, and production-grade local or
OIDC auth. Released Helm images already use immutable version tags; production
values should continue to pin a release tag or image digest rather than
`latest`.

For additional runtime design and security background, see
[`docs/openshell-kubernetes-runtime.md`](docs/openshell-kubernetes-runtime.md)
and [`docs/mvp-core-flow.md`](docs/mvp-core-flow.md). This README is the source
of truth for executable Release/Helm and local source setup commands.
