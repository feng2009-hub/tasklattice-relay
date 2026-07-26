# Control Plane configuration

TaskLattice Control reads one TOML file. Production starts only when
`TASKLATTICE_CONFIG` points to a valid file. The Helm chart renders this file
as the `control.toml` entry in the TaskLattice Secret and mounts it read-only at
`/etc/tasklattice/control.toml`.

```toml
schema_version = 1

[server]
public_url = "https://tasklattice.example.com"

[database]
url = "postgresql://tasklattice:password@postgresql:5432/tasklattice"

[auth]
session_signing_key = "replace-with-a-long-random-secret"

[auth.local]
enabled = true
initial_super_admin_username = "admin"
initial_super_admin_password_hash = "$2b$12$REPLACE_WITH_A_REAL_BCRYPT_HASH"

[auth.oidc]
enabled = true
display_name = "Company SSO"
issuer = "https://identity.example.com/realms/tasklattice"
client_id = "tasklattice-control-plane"
client_secret = "replace-me"

[runner]
url = "http://tasklattice-runner:9090"
token = "replace-me"

[litellm]
url = "http://tasklattice-litellm:4000"
master_key = "replace-me"
```

At least one authentication provider must be enabled. OIDC redirect URIs are
derived as `<server.public_url>/auth/sso/callback`; scopes are fixed to
`openid profile email`.

## Identity ownership

The TOML file enables authentication providers. PostgreSQL remains the source
of truth for users, credentials, system roles, account status, personal
preferences, and Project memberships.

When Local authentication is enabled, the initial Super Administrator values
are used only if the database has no Super Administrator or the SQL-seeded
administrator has no credential yet. They never overwrite a database password.
Local login and My Account password changes use the bcrypt hash in
`local_credentials`.

OIDC login identifies an external identity by the exact `(issuer, subject)`
pair. The first successful login creates a local `users` row and a
`user_identities` mapping. Later logins resolve the same local user even when
the IdP username or email changes. An email collision with another local user
is rejected instead of automatically linking accounts.

TaskLattice sessions use the local `users.id` as their subject. Project
authorization is loaded exclusively from `project_members`, including for the
bootstrap Super Administrator. The system-level `super_administrator` role is
reserved for platform setup, administration, and cross-Project audit
capabilities; it never grants implicit access to Project business operations.

The configuration file contains credentials and must be treated as a secret.
Do not commit a deployed `control.toml`; `control.example.toml` is the tracked
template.

For complete SSO integration tests, the Helm Chart can generate this OIDC
section and deploy a preconfigured ephemeral Keycloak instance. Enable it with
`keycloak.enabled=true` and set `keycloak.publicUrl` to an address reachable
from both users' browsers and the Control pod. See the Chart README for test
users and deployment examples.
