# Platform configuration ownership

TaskLattice Relay separates deployment topology from Platform Administrator
policy. Platform settings are database-owned and audited; deployment settings
describe how Control reaches infrastructure and how the first administrator
recovers access.

Department-owned model, routing, and quota defaults are documented in
[Department Setting](./department-settings.md). They are not Platform fallbacks
and require an explicit Department Administrator role.

## Current boundary

`control.toml` contains 15 operational fields plus `schema_version`:

- public and internal service URLs;
- the database URL and Better Auth secret;
- Local authentication enablement and the three initial Platform Administrator
  bootstrap values;
- Runner and LiteLLM URLs and credentials;
- Runtime Namespace enablement, cluster ID, and name prefix.

These values remain deployment-managed because changing them affects process
bootstrap, infrastructure connectivity, or the administrator recovery path.

The Platform database is the only source for:

- OpenClaw and Hermes Sandbox image overrides;
- new OpenShell Sandbox CPU and memory overrides;
- Runtime Namespace deletion timeout;
- Model Provider admission;
- OIDC enabled state, display name, issuer, Client ID, and encrypted Client
  secret;
- SMTP enabled state, connection metadata, sender identity, and encrypted
  password;
- Departments, people, Department Role bindings, Projects, and Project Role
  bindings;
- the system-managed, revisioned seven-Role catalog and its persisted
  Role-to-Capability grants.

OIDC, SMTP, Sandbox resource overrides, and Runtime deletion policy have no
`control.toml` fallback. A
missing database record means the feature is disabled or uses the documented
application default; it does not read a legacy deployment value.

The effective Sandbox image still follows this runtime precedence because the
deployed Runner reports image compatibility:

1. Platform database override;
2. image reported by the deployed Runner;
3. application fallback when neither source is available.

The same precedence applies to CPU and memory for a newly created OpenShell
Sandbox: a Platform database override wins, otherwise the Runner deployment
default reported by its health endpoint is used. OpenShell gateway endpoint,
Workspace, service route base, Kubernetes service CIDRs, Gateway image,
Supervisor image, base image, pull policy, and TLS mode remain deployment-owned.
Platform Setting displays those values read-only so Platform Administrators can
diagnose the active topology without being allowed to mutate cluster bootstrap
configuration.

## Secrets and live updates

OIDC Client secrets and SMTP passwords are encrypted with AES-256-GCM using a
domain-separated key derived from `auth.secret`. APIs return only whether a
secret is configured. Keep `auth.secret` stable across every Control replica.
Rotating it makes stored Platform secrets unreadable; use Local authentication
to replace both secrets after rotation.

SSO changes require Local authentication to remain enabled as a recovery path.
An enabled SSO draft must pass Discovery and JWKS validation before it can be
saved. Better Auth checks the shared revision before SSO requests and rebuilds
its provider configuration without a process restart.

The invitation mailer and Runtime Namespace cleanup read the current Platform
settings when work begins, so changes are visible to every replica without
rewriting a mounted Secret or restarting Control.

## Requirements for future migrations

Before another setting moves out of `control.toml`, its implementation must:

1. store a revision, actor, and update time;
2. validate the complete configuration before activation;
3. define a single canonical source and an explicit unset behavior;
4. update all replicas consistently or declare that a restart is required;
5. retain a recovery path for authentication and external connectivity;
6. record an audit event without logging secret values.
