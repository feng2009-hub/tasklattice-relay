# Control Plane configuration

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
initial_super_admin_username = "admin"
initial_super_admin_email = "admin@tasklattice.local"
initial_super_admin_password = "replace-with-a-strong-password"

[auth.oidc]
enabled = true
display_name = "Company SSO"
issuer = "https://identity.example.com/realms/tali"
client_id = "tali-control-plane"
client_secret = "replace-me"

[runner]
url = "http://tali-relay-runner:9090"
token = "replace-me"

[litellm]
url = "http://tali-relay-litellm:4000"
master_key = "replace-me"

[smtp]
enabled = true
host = "smtp.example.com"
port = 587
secure = false
username = "tali@example.com"
password = "replace-me"
from_address = "tali@example.com"
from_name = "TaskLattice Relay"
reply_to = "support@example.com"
```

At least one authentication provider must be enabled. `server.public_url` is
always required because Better Auth uses it as the canonical origin for secure
session cookies, origin checks, and OAuth callbacks. The OIDC redirect URI is
`<server.public_url>/api/auth/callback/corporate-sso`; scopes are fixed to
`openid profile email`.

SMTP is optional, but invitations to email addresses that do not already map
to a TaskLattice Relay user are rejected unless `smtp.enabled = true`. SMTP also
requires `server.public_url`; invitation emails use it as the browser-visible
sign-in link. Set `secure = true` for implicit TLS, normally on port 465. For
port 587, keep `secure = false` so the transport can upgrade with STARTTLS.
`username` and `password` must either both be configured or both be empty for
an unauthenticated internal relay. SMTP credentials live inside
`control.toml`, so the file must remain a Secret.

## Identity ownership

Better Auth is the sole authentication and session owner. PostgreSQL stores
its `users`, `auth_accounts`, `auth_sessions`, and `auth_verifications` models
in the `tasklattice` schema. The same `users.id` is the stable subject consumed
by TaskLattice Relay authorization.

When Local authentication is enabled, all three initial Super Administrator
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

`systemRole=super_administrator` remains bootstrap/platform metadata. It grants
neither Department nor Project access. Department administration still comes
only from an active Department `administrator` membership, and Project
Capabilities still come only from the active Project Role.

The configuration file contains credentials and must be treated as a secret.
Do not commit a deployed `control.toml`; `control.example.toml` is the tracked
template.

For complete SSO integration tests, the Helm Chart can generate this OIDC
section and deploy a preconfigured ephemeral Keycloak instance. Enable it with
`keycloak.enabled=true` and set `keycloak.publicUrl` to an address reachable
from both users' browsers and the Control pod. See the Chart README for test
users and deployment examples.
