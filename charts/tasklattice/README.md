# TaskLattice Helm Chart

This chart installs the complete TaskLattice stack: control/UI, OpenShell
runner, LiteLLM, PostgreSQL, OpenShell, and the Agent Sandbox controller. The
OpenShell 0.0.82 and Agent Sandbox v0.5.1 charts are vendored so the packaged
GitHub Release artifact is self-contained.

The source Chart uses the development version `0.0.0-dev` and resolves its
first-party images to `:dev`. The Release workflow replaces both Chart version
and `appVersion` with the exact Git Release version before publishing.

Install a released chart:

```bash
VERSION="<release-version>"
curl -fLO "https://github.com/Sn0rt/TaskLattice/releases/download/v${VERSION}/tasklattice-${VERSION}.tgz"
helm upgrade --install tasklattice "./tasklattice-${VERSION}.tgz" \
  --namespace tasklattice-sandboxes \
  --create-namespace \
  --wait \
  --timeout 10m
```

The same chart is published as an OCI artifact:

```bash
VERSION="<release-version>"
helm upgrade --install tasklattice \
  oci://ghcr.io/sn0rt/charts/tasklattice \
  --version "${VERSION}" \
  --namespace tasklattice-sandboxes \
  --create-namespace \
  --wait \
  --timeout 10m
```

Defaults preserve the repository's trusted local-cluster setup and use
`admin/admin`. Before shared or internet-facing use, provide a private values
file that changes every `secrets.*` value and configures OpenShell TLS/OIDC.
If the Agent Sandbox controller already exists cluster-wide, set
`agentSandbox.enabled=false`. For private GHCR packages, create a registry
pull Secret and add it to both `global.imagePullSecrets` and
`openshell.server.sandboxImagePullSecrets`.

When `secrets.existingSecret` is used it must contain `control.toml`,
`runner-token`, `litellm-master-key`, `postgres-password`, `database-url`,
`litellm-ui-username`, `litellm-ui-password`, and `litellm-salt-key`.
`control.toml` contains the Control Plane database, Local/OIDC authentication,
Runner, and LiteLLM settings. Set `runner.gatewayEndpoint`
when `openshell.enabled=false` and the gateway is managed outside this release.

## Embedded Keycloak for end-to-end tests

Set `keycloak.enabled=true` to deploy a test-only Keycloak instance together
with TaskLattice. The Chart imports the `tasklattice` realm, configures the
confidential `tasklattice-control-plane` OIDC client, creates complete Alice
and Bob test profiles, and automatically enables the matching OIDC settings in
`control.toml`.

Keycloak needs a stable URL that is reachable from both the browser and the
Control pod. For a cluster with a reserved load-balancer address:

```bash
helm upgrade --install tasklattice charts/tasklattice \
  --namespace tasklattice-sandboxes \
  --create-namespace \
  --set control.publicUrl=http://192.168.139.2 \
  --set keycloak.enabled=true \
  --set keycloak.publicUrl=http://192.168.139.3:8080 \
  --set keycloak.service.loadBalancerIP=192.168.139.3
```

For local environments where the browser uses a loopback hostname while the
Control pod reaches the same endpoint through the node address, map that
hostname with `control.hostAliases`. For example, OrbStack can use
`keycloak.localhost` in `keycloak.publicUrl` and map it to the OrbStack node IP.
The repository's local deployment script performs this mapping automatically:

```bash
npm run helm:deploy:dev:keycloak
```

The development credentials are:

| Purpose | Username | Password |
| --- | --- | --- |
| Keycloak administration | `admin` | `admin` |
| TaskLattice SSO user | `alice` | `password` |
| TaskLattice SSO user | `bob` | `password` |

Override `secrets.keycloakAdminPassword`,
`secrets.keycloakClientSecret`, and `secrets.keycloakTestUserPassword` when
needed. Test user profile fields can be replaced through
`keycloak.testUsers`.

This mode runs Keycloak with `start-dev` and ephemeral storage. Realm changes
are lost when its pod is replaced. It intentionally cannot be combined with
`secrets.existingSecret`, because the Chart must generate matching Keycloak
credentials and `control.toml`. Use `auth.oidc` with an independently managed
identity provider for production.

## Example MCP Server for integration tests

Set `exampleMcp.enabled=true` to deploy a test-only, in-cluster Streamable HTTP
MCP Server. It exposes three deterministic tools: `echo_message`,
`calculate_sum`, and `get_platform_status`. The Service is not exposed outside
the cluster and is available to LiteLLM at:

```text
http://tasklattice-example-mcp:3000/mcp
```

Build and deploy the local example together with Keycloak:

```bash
npm run images:build:example-mcp
npm run helm:deploy:dev:keycloak:example-mcp
```

Register the endpoint as a custom HTTP MCP Server in a Project. TaskLattice
then asks LiteLLM to discover the tools and stores the resulting names,
descriptions, input schemas, and discovery status in the Project database.
This component has no authentication and must not be enabled in production.

## Shared database

TaskLattice control and LiteLLM intentionally use the same `database-url`.
LiteLLM owns the PostgreSQL `public` schema; the control plane and its Prisma
migration history live in the `tasklattice` schema. The control Deployment has
an init container that runs `prisma migrate deploy`, including the SQL migration
that creates the default Project and preconfigured Skill, MCP Server, Knowledge
Source, Agent Role, and policy metadata.

An external database supplied through `secrets.existingSecret` must allow the
configured role to create and modify the `tasklattice` schema. There is no
SQLite mode or control-plane data PVC.
