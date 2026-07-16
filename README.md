# TaskLattice

TaskLattice is a multi-agent orchestration platform for scheduling, isolating, and operating Agent workloads on Kubernetes.

The current product slice creates NemoClaw Agents with either OpenClaw (the default) or Hermes inside an OpenShell sandbox using a validated Provider Account and LLM deployment.

```text
TanStack + shadcn/ui
        |
        | REST /api/v1
        v
TaskLattice Control API + Runtime Runner on Kubernetes
        |
        | OpenShell gRPC lifecycle + exec relay
        v
Agent Sandbox CR -> NemoClaw Sandbox Pod + workspace PVC
```

The current source of truth is [docs/mvp-core-flow.md](docs/mvp-core-flow.md). The larger marketplace documents describe later product scope; their unused UI actions are intentionally disabled.

## Technology stack

- Node.js 22+
- React 19 and TanStack Start on Vite/Nitro
- TanStack Router with generated file routes and server rendering
- TanStack Query for server state and polling
- TanStack Form for Agent configuration
- Tailwind CSS 4 and shadcn/ui components
- xterm.js for interactive terminal rendering
- Nitro REST/WebSocket routes with SQLite resource persistence
- Vercel AI SDK and `@ai-sdk/deepseek`
- typed runtime runner using OpenShell and `node-pty`
- OpenShell Kubernetes driver and Agent Sandbox controller
- NVIDIA NemoClaw runtime image pinned by source revision and base-image digest

## Local core-flow validation

The fixture runner validates the REST and WebSocket contracts without claiming that NemoClaw ran on a machine where it is not installed.

Terminal 1:

```sh
NEMOCLAW_RUNNER_MODE=fixture npm run dev:runner
```

Terminal 2:

```sh
DATABASE_PATH=/tmp/tasklattice.db PORT=18080 npm run dev:control
```

Terminal 3:

```sh
npm run validate:core
```

The validation uses an already validated LLM deployment, creates an Agent through REST, waits for `READY`, creates a short-lived terminal session, and proves bidirectional terminal I/O with `TALI_TERMINAL_OK`. Register a Provider Account and model in the console before running it; startup no longer inserts legacy Provider Connection seed data.

## Run the Kubernetes Sandbox runtime

The preferred MVP path creates the sandbox itself as a Kubernetes Pod. The
runner invokes OpenShell's Kubernetes driver and allocates terminals with
`openshell sandbox exec --tty`; it does not run Docker-in-Docker or mount a
Docker socket. Pod creation launches the selected platform's `nemoclaw-start`
supervisor as the long-lived OpenShell-managed process. Readiness is not
published until its platform-specific health probe succeeds. Browser terminal
sessions open either the Gateway-backed `openclaw tui` or `hermes --tui`; the
local fixture rejects TUI allocation because it validates control contracts
without pretending to run the NemoClaw stack.

The default sandbox request is 1 CPU and 2 GiB memory. The complete NemoClaw
runtime can be OOM-killed during gateway/plugin startup at the former 1 GiB
limit; override these defaults with `OPENSHELL_SANDBOX_CPU` and
`OPENSHELL_SANDBOX_MEMORY` on the runner when the cluster has a validated
capacity profile.

Create the ignored local environment file before starting the API or runner:

```sh
cp .env.example .env
```

`npm run dev:control` and `npm run dev:runner` load this root `.env` through
Node.js. Provider credentials are registered and validated through the Provider Account API, stored server-side, and never returned to the browser. The real `.env` is excluded from Git and Docker build contexts.

Built-in OpenShell Policies live in `infra/kubernetes/base/policy-catalog.yaml`. Kustomize publishes that file as the `tasklattice-sandbox-policies` ConfigMap and mounts it read-only in the control Pod. `unrestricted` is the deployment default and preserves `/dev/null`, `/sandbox`, and `/tmp` for OpenClaw startup; custom Policies are stored in SQLite.

## Authentication

The control UI and Agent APIs require authentication. Local development uses
`admin / admin` only when no auth variables are configured; the login page
shows a development warning in that state. Production startup requires an
explicit JWT secret and local password or bcrypt password hash.

Local login uses:

```text
TALI_AUTH_MODE=local
TALI_AUTH_JWT_SECRET=<long random secret>
TALI_AUTH_LOCAL_USERNAME=admin
TALI_AUTH_LOCAL_PASSWORD=<local password>
# Or use TALI_AUTH_LOCAL_PASSWORD_HASH with a bcrypt hash.
```

To offer local login and OIDC SSO together, set `TALI_AUTH_MODE=local-sso` and
configure `TALI_AUTH_OIDC_ISSUER`, `TALI_AUTH_OIDC_CLIENT_ID`, the optional
client secret, redirect URI, provider name, and scopes shown in `.env.example`.
The callback is `/auth/sso/callback`; the implementation uses Authorization
Code, PKCE, nonce validation, discovery, and provider signing-key validation.

`npm run validate:core` signs in before exercising the protected API. Set
`TALI_VALIDATION_USERNAME` and `TALI_VALIDATION_PASSWORD` when the server does
not use the local development defaults.

```sh
npm run k8s:install-openshell
npm run images:build
npm run k8s:deploy:openshell
kubectl -n tasklattice-sandboxes get service tasklattice-control
TALI_BASE_URL=http://localhost npm run validate:core
```

See [docs/openshell-kubernetes-runtime.md](docs/openshell-kubernetes-runtime.md)
for the topology, version pins, security boundary, and production gaps.

`npm run images:build` builds both Agent platform images. Use
`npm run images:build:sandbox:openclaw` or
`npm run images:build:sandbox:hermes` when iterating on one platform. The
runner resolves their image names through `OPENSHELL_SANDBOX_IMAGE` and
`OPENSHELL_HERMES_SANDBOX_IMAGE`, respectively.

## Legacy Docker-host NemoClaw runner

The alternative `nemoclaw` runner mode belongs on a dedicated runtime host with
Docker, OpenShell, and the pinned `nemoclaw` CLI installed. It is retained for
upstream Docker-mode compatibility and is not deployed as a privileged
Kubernetes Pod.

```sh
export NEMOCLAW_RUNNER_MODE=nemoclaw
export NEMOCLAW_RUNNER_TOKEN='replace-with-a-secret'
export DEEPSEEK_API_KEY='replace-with-a-secret'
export DEEPSEEK_VERIFY_ON_CREATE=1
npm run dev:runner
```

For DeepSeek, the runner uses Vercel AI SDK for the optional preflight and maps the same configuration to NemoClaw's OpenAI-compatible onboarding contract:

```text
NEMOCLAW_PROVIDER=custom
NEMOCLAW_ENDPOINT_URL=https://api.deepseek.com
NEMOCLAW_MODEL=deepseek-chat or deepseek-reasoner
COMPATIBLE_API_KEY=<DeepSeek secret on Runtime Host>
```

The legacy host-runner key is never placed in process arguments. The Kubernetes control flow instead validates a Provider Account, registers its model through LiteLLM, and gives each Instance a model-scoped key.
After onboarding, the runner installs the submitted `systemPrompt` in the
selected platform's supported instruction location: OpenClaw's
`/sandbox/.openclaw/workspace/AGENTS.md` or Hermes'
`/sandbox/.hermes/SOUL.md`. Platform-specific paths, terminal commands, probes,
images, and endpoint types live in one runner adapter registry rather than in
the REST or UI layers.

## Fixture-only Kubernetes control plane

For local OrbStack validation, expose the fixture or real runner to the Kubernetes VM:

```sh
HOST=0.0.0.0 NEMOCLAW_RUNNER_MODE=fixture npm run dev:runner
npm run images:build
npm run k8s:deploy
kubectl -n tasklattice-sandboxes rollout status deployment/tasklattice-control
kubectl -n tasklattice-sandboxes get service tasklattice-control
```

The `local` overlay targets `http://host.docker.internal:9090` and is retained
for fixture testing. Use the `openshell` overlay for the Pod-backed runtime. The
base manifest targets an operator-provided runtime service and expects the
shared runner token in a Kubernetes Secret. Production must use mTLS or an
equivalent workload-authenticated private channel, not only the local bearer
token.

## REST API

The versioned interface for first-party and third-party UIs is under `/api/v1`:

```text
GET    /api/v1/auth/config
POST   /api/v1/auth/local
GET    /api/v1/auth/me
POST   /api/v1/auth/logout
GET    /api/v1/auth/sso/start
GET    /api/v1/providers
GET    /api/v1/agents
POST   /api/v1/agents
GET    /api/v1/agents/{agentId}
DELETE /api/v1/agents/{agentId}
POST   /api/v1/agents/{agentId}/terminal-sessions
GET    /api/v1/openapi.json
```

Agent and provider routes require `Authorization: Bearer <token>`. OIDC returns
through `/auth/sso/callback` and completes the browser session without putting
the TaskLattice token in the query string.

Interactive terminal bytes use the short-lived WebSocket URL returned by `terminal-sessions`; they are not forced into a polling REST abstraction.
The complete machine-readable request and response schemas are published at `/api/v1/openapi.json` for third-party client generation.
