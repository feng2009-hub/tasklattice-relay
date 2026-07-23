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

When `secrets.existingSecret` is used it must contain `runner-token`,
`litellm-master-key`, `postgres-password`, `database-url`, `jwt-secret`,
`local-password`, `oidc-client-secret`, `litellm-ui-username`,
`litellm-ui-password`, and `litellm-salt-key`. Set `runner.gatewayEndpoint`
when `openshell.enabled=false` and the gateway is managed outside this release.

## Shared database

TaskLattice control and LiteLLM intentionally use the same `database-url`.
LiteLLM owns the PostgreSQL `public` schema; the control plane and its Prisma
migration history live in the `tasklattice` schema. The control Deployment has
an init container that runs `prisma migrate deploy`, including the SQL migration
that creates the default Individual workspace and preconfigured extension and
policy metadata.

An external database supplied through `secrets.existingSecret` must allow the
configured role to create and modify the `tasklattice` schema. There is no
SQLite mode or control-plane data PVC.
