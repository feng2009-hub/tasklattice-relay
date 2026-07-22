# TaskLattice Helm Chart

This chart installs the complete TaskLattice stack: control/UI, OpenShell
runner, LiteLLM, PostgreSQL, OpenShell, and the Agent Sandbox controller. The
OpenShell 0.0.82 and Agent Sandbox v0.5.1 charts are vendored so the packaged
GitHub Release artifact is self-contained.

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

## Kind smoke test

The repository includes a smoke test that builds the control, runner, and
LiteLLM images, loads them into an existing Kind cluster, installs this chart,
and waits for every TaskLattice and Agent Sandbox controller Pod to become
Ready:

```bash
kind create cluster --name tasklattice-ci
bash scripts/helm-kind-smoke.sh
```

Set both `BUILD_IMAGES=0` and `IMAGE_TAG=<existing-tag>` to reuse images already
present in Docker. A normal local run generates a unique image tag so an
existing Helm release cannot accidentally keep stale Pods. OpenClaw and Hermes
sandbox images are not built by this check because they are pulled only after
an Instance is created; the smoke test validates the chart's deployment Pods.
GitHub Actions runs the same script in
`.github/workflows/helm-kind-smoke.yml`.
