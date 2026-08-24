# Control Plane configuration

See [Platform configuration ownership](platform-configuration-ownership.md)
for the reviewed boundary between deployment bootstrap, online Platform policy,
and external secrets.

TaskLattice Relay Control reads one TOML file. Production starts only when
`TALI_CONFIG` points to a valid file. The Helm chart renders this file
as the `control.toml` entry in the TaskLattice Relay Secret and mounts it read-only at
`/etc/tali/control.toml`.

```toml
schema_version = 1

[server]
# Required canonical browser origin for Better Auth cookies and callbacks.
public_url = "https://tali.example.com"
internal_url = "http://tali-relay-control:38080"

[database]
url = "postgresql://tali:password@postgresql:5432/tali"

[auth]
secret = "replace-with-at-least-32-random-characters"

[auth.local]
enabled = true
initial_platform_administrator_username = "admin"
initial_platform_administrator_email = "admin@tasklattice.local"
initial_platform_administrator_password = "replace-with-a-strong-password"

[runner]
url = "http://tali-relay-runner:9090"
token = "replace-me"

[litellm]
url = "http://tali-relay-litellm:4000"
master_key = "replace-me"

[runtime_namespaces]
enabled = true
cluster_id = "in-cluster"
name_prefix = "tali-p"
```

`server.public_url` is always required because Better Auth uses it as the
canonical origin for secure session cookies, origin checks, and OAuth
callbacks. The OIDC redirect URI is
`<server.public_url>/api/auth/callback/corporate-sso`; scopes are fixed to
`openid profile email`.

OIDC is configured only from **Platform Setting -> Security & SSO** and is
stored in the Platform database. There is no `control.toml` fallback. Complete
the form, select **Validate SSO**, then save the validated configuration.
Control replicas refresh Better Auth from the shared settings revision without
a restart.

**Validate SSO** checks the unsaved issuer against its discovery document and
confirms that the advertised JWKS endpoint contains signing keys. Validation
does not persist the draft or send the Client secret to the identity provider;
the Client ID and Client secret are verified only during an actual SSO sign-in.

The online Client secret is encrypted at rest with a key derived from
`auth.secret` and is never returned by the API. Keep `auth.secret` stable across
all Control replicas. Before rotating it, plan to sign in locally and replace
the stored OIDC Client secret and SMTP password after rotation.
Online SSO editing is deliberately unavailable when Local authentication is
disabled so an invalid provider cannot remove the last administrator recovery
path.

SMTP is configured only from **Platform Setting -> Email delivery** and is
stored in the Platform database. There is no `control.toml` fallback.
Invitations to an email address that does not already map to a Relay user are
rejected until email delivery is enabled. SMTP still uses `server.public_url`
for the browser-visible sign-in link. Set implicit TLS for port 465; for port
587 leave it off so the transport can upgrade with STARTTLS. Username and
password must either both be configured or both be empty for an unauthenticated
internal relay.

New OpenShell Sandbox CPU and memory defaults and the Project Namespace
deletion timeout are database-owned and can be changed from **Platform Setting
-> Sandbox**. OpenClaw and Hermes image references remain editable under
**Platform Setting -> Runtime** because they are resolved when a new Sandbox is
created. Runtime Namespace enablement, cluster identity, name prefix, and
OpenShell gateway topology remain deployment configuration.

## Identity ownership

Better Auth is the sole authentication and session owner. PostgreSQL stores
its `users`, `auth_accounts`, `auth_sessions`, and `auth_verifications` models
in the `tasklattice` schema. The same `users.id` is the stable subject consumed
by TaskLattice Relay authorization.

Dashboard sessions use a 30-minute sliding idle timeout. Every authenticated
API request refreshes the Better Auth database expiration and browser cookie.
After 30 minutes without activity the session is invalid and is deleted when it
is next presented to Better Auth.

Relay namespaces all Better Auth cookies with the `tali-relay` prefix. This is
required when Relay and another Better Auth application run on different ports
of the same hostname because browser cookies are not isolated by port.

When Local authentication is enabled, all three initial Platform Administrator
values are required. On first startup, Better Auth creates one `credential`
account and hashes the plaintext bootstrap password with its native password
hasher. Later startups never overwrite an existing database password. Password
changes run through Better Auth and revoke the user's other sessions.

OIDC login is implemented by Better Auth's Generic OAuth plugin with discovery,
PKCE, and required ID-token verification. External identities are stored as
Better Auth accounts keyed by the provider issuer and stable subject. The
provider may create a Better Auth user on first successful login.

Application requests resolve a Better Auth cookie session into a minimal
`PlatformPrincipal`; no JWT claims or browser-stored bearer token cross this
boundary. TaskLattice Relay sessions use the local `users.id` as their subject.
Department administration is loaded exclusively from an active
`department_members` binding whose role is `administrator`. Project business
authorization is loaded exclusively from `project_members`. These bindings do
not inherit from one another.

`systemRole=platform_administrator` remains platform-level metadata. It grants
neither Department nor Project access. Department administration still comes
only from an active Department `administrator` membership, and Project
Capabilities still come only from the active Project Role.

The configuration file still contains credentials and must be treated as a secret.
Do not commit a deployed `control.toml`; `control.example.toml` is the tracked
template.

For complete SSO integration tests, the Helm Chart can deploy a preconfigured
ephemeral Keycloak instance. Enable it with `keycloak.enabled=true`, then enter
its issuer and generated Client credentials in **Platform Setting -> Security
& SSO**. See the Chart README for test users and deployment examples.

SSO authorization is also database-owned. Configure the OIDC Group claim
(normally `groups`) and explicit Group Role Bindings in Platform Setting. A
binding targets the Platform, one Department ID, or one Project ID and one
stable Role ID. The Control plane matches complete Group paths exactly during
SSO sign-in; it never grants authority merely because a Group name resembles a
Role. Removing a Group revokes only its external grant and preserves manually
assigned memberships.
