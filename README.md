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

This README is the supported zero-to-running local path. It was validated with
OrbStack, whose Kubernetes cluster can use locally built Docker images and
exposes `LoadBalancer` Services on localhost. Other clusters work, but their
nodes must be able to pull the TaskLattice images from a registry or receive
them through the cluster's image-loading mechanism.

## What gets installed

| Component | Version or image | Purpose and state |
| --- | --- | --- |
| TaskLattice control | `tasklattice-control:0.2.0` | UI and API; SQLite at `/data/tasklattice.db` on the `tasklattice-control-data` PVC |
| Runtime runner | `tasklattice-openshell-runner:0.2.0` | Creates, observes, opens terminals to, and destroys OpenShell sandboxes |
| LiteLLM | `tasklattice-litellm:0.2.0` | Model gateway, per-Instance keys, and spend attribution |
| LiteLLM PostgreSQL | `postgres:17-alpine` | LiteLLM configuration and usage data on its StatefulSet PVC |
| OpenShell | `0.0.82` | Sandbox gateway, policy enforcement, audit logs, exec relay, and HTTP service routing |
| Agent Sandbox controller | `0.5.1` | Kubernetes Sandbox CR, Pod, and workspace PVC lifecycle |
| OpenClaw sandbox | `tasklattice-nemoclaw-sandbox:0.3.0` | Default Agent image built from pinned NemoClaw source |
| Hermes sandbox | `tasklattice-nemoclaw-hermes-sandbox:0.3.0` | Hermes Agent image with the OpenShell-compatible UID and configuration overlay |

Prisma is embedded in the LiteLLM image and runs LiteLLM's database generation
and migration workflow. It is a library/CLI dependency, not a separate Pod.

The pinned NemoClaw revisions, base-image digests, and platform-specific build
logic are in [`scripts/build-nemoclaw-sandbox.sh`](scripts/build-nemoclaw-sandbox.sh).
The OpenShell and Agent Sandbox pins are in
[`scripts/install-openshell-k8s.sh`](scripts/install-openshell-k8s.sh).

## Prerequisites

Install and start all of the following before cloning the repository:

- Git and outbound access to GitHub, Docker Hub, GHCR, and the npm registry.
- Node.js 22 or newer and npm.
- Docker with BuildKit support.
- A Kubernetes 1.29+ cluster with a default `ReadWriteOnce` StorageClass.
- `kubectl`, configured for the target cluster.
- Helm, `curl`, and `tar`.
- A model Provider API key. DeepSeek, OpenAI, Kimi China, Kimi Global, and a
  custom OpenAI-compatible endpoint are available in the Provider catalog.
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

## Deploy from a clean checkout

### 1. Clone and validate the source tree

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

### 2. Build every required local image

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

### 3. Install the sandbox runtime

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

### 4. Deploy TaskLattice, LiteLLM, and PostgreSQL

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
temporarily forward both Services:

```sh
kubectl -n tasklattice-sandboxes port-forward service/tasklattice-control 18080:80
kubectl -n openshell port-forward service/openshell 8080:8080
```

With that fallback, use `http://127.0.0.1:18080` for the control console and
validation base URL. The OpenShell forward must remain on port 8080 because
per-Instance URLs use `http://<sandbox>--webui.openshell.localhost:8080/`.

### 5. Register a Provider and models

An Instance cannot be created until at least one LLM model is `VALIDATED`.
There is no automatic legacy Provider seed.

1. Sign in and open **Providers**.
2. Select **Register Provider**.
3. Choose DeepSeek, OpenAI, Kimi, or Custom.
4. For a catalog Provider, enter only the API key; the Endpoint and known model
   metadata are supplied by the catalog. For Custom, enter the account name,
   OpenAI-compatible Endpoint, and key.
5. Select **Validate key & configure**.
6. Confirm that the Endpoint, credential, and model-catalog checks pass and at
   least one model appears as `VALIDATED`.

TaskLattice validates `<endpoint>/models`, stores the credential server-side,
registers available catalog defaults in LiteLLM, and never returns the key to
the browser. Custom accounts keep an explicit **Add model** step because their
model category and pricing are not known by the platform catalog.

A Provider Account cannot be deleted while an Instance uses one of its models.
Delete the dependent Instance first.

### 6. Create the first Instance

1. Open **Instances** and select **Create Instance**.
2. Enter the Agent name, description, and system instructions.
3. Select an Agent: **OpenClaw** is the default; **Hermes** is also supported.
   OpenShell is fixed and is not a selectable Agent.
4. Select a validated LLM deployment.
5. Keep the built-in **Unrestricted** Policy for the first run. It is the
   deployment default and is immutable in the Policy UI.
6. Skills and MCP servers are optional. Complete the review and create the
   Instance.

The Instance remains visible while it moves through `PROVISIONING` stages. A
successful run reaches `READY`, exposes the Agent Web UI or Hermes dashboard,
and enables its full-screen TUI. OpenShell creates the same-name Sandbox Pod
and workspace PVC in the `openshell` namespace.

Inspect the runtime while provisioning:

```sh
kubectl -n openshell get sandboxes,pods,pvc
kubectl -n tasklattice-sandboxes logs deployment/tasklattice-openshell-runner --tail=200
kubectl -n openshell logs statefulset/openshell --tail=200
```

Each Instance gets a model-scoped LiteLLM key. Its effective OpenShell Policy
adds the configured inference Endpoint and the Kubernetes service suffix
`**.svc.cluster.local` on that Endpoint's port. Private Service CIDRs come from
`OPENSHELL_KUBERNETES_SERVICE_CIDRS`; update the runner Deployment if the
cluster uses a non-RFC1918 Service network.

Deleting an Instance first marks it `DESTROYING`, then removes its OpenShell
Sandbox, routed HTTP endpoint, Pod, and workspace PVC before removing it from
the active list.

### 7. Run the end-to-end proof

After a Provider model is validated, run the real OpenClaw proof path:

```sh
TALI_BASE_URL=http://localhost \
TALI_EXPECT_NEMOCLAW_RUNTIME=1 \
npm run validate:core
```

If custom local credentials are configured, also set
`TALI_VALIDATION_USERNAME` and `TALI_VALIDATION_PASSWORD`. The validator:

1. signs in through the local auth API;
2. selects a validated LLM deployment;
3. creates an OpenClaw Instance using the OpenShell runtime;
4. waits up to three minutes for `READY`;
5. checks the routed HTTP endpoint;
6. opens a terminal WebSocket and waits for the first TUI frame; and
7. deletes the Instance and verifies its API resource and HTTP endpoint are gone.

The script is destructive only to the temporary `validation-*` Instance it
creates. It does not delete the Provider Account or model.

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

The fixture path still requires a validated Provider Account in that control
database before `npm run validate:core` can create an Instance. It verifies the
control contract and deliberately does not claim that an Agent TUI ran.

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

- TaskLattice resources are in `tasklattice-sandboxes`.
- OpenShell Sandbox CRs, Agent Pods, and workspace PVCs are in `openshell`.
- The control SQLite database uses `tasklattice-control-data`.
- LiteLLM PostgreSQL uses the `data-tasklattice-litellm-postgres-0` PVC.
- Deleting or restarting a Pod does not reset either database. Deleting the PVC
  does.

Remove the TaskLattice OpenShell overlay with:

```sh
npm run k8s:delete:openshell
```

That command does not uninstall the OpenShell Helm release or Agent Sandbox
controller. Review PVCs and active Sandboxes before any full runtime reset.

## Troubleshooting

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

### No model is available during Instance creation

Open **Providers**, revalidate the Provider Account, and confirm at least one
LLM deployment is `VALIDATED`. Endpoint authentication alone is insufficient if
the Provider returned no matching catalog model or LiteLLM registration failed.

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

The checked-in Kubernetes overlay is not a production deployment. Before using
a shared environment, add authenticated TLS for OpenShell, managed Secrets,
registry-backed immutable image tags, ingress and DNS, per-tenant namespaces
and quotas, Kubernetes NetworkPolicies, durable runner operation state, backup
and restore for both databases, and production-grade local or OIDC auth.

## API

The versioned API is under `/api/v1`; its machine-readable schema is available
at `/api/v1/openapi.json`. Important routes include:

```text
GET    /api/v1/auth/config
POST   /api/v1/auth/local
GET    /api/v1/providers
GET    /api/v1/providers/models
GET    /api/v1/agents
POST   /api/v1/agents
GET    /api/v1/agents/{agentId}
DELETE /api/v1/agents/{agentId}
POST   /api/v1/agents/{agentId}/terminal-sessions
GET    /api/v1/openapi.json
```

Agent and Provider routes require `Authorization: Bearer <token>`. Interactive
terminal bytes use the short-lived WebSocket URL returned by
`terminal-sessions`.

For additional runtime design and security background, see
[`docs/openshell-kubernetes-runtime.md`](docs/openshell-kubernetes-runtime.md)
and [`docs/mvp-core-flow.md`](docs/mvp-core-flow.md). This README is the source
of truth for executable local setup and verification commands.
