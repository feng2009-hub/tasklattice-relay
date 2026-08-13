# Control-plane database

TaskLattice Relay uses Prisma ORM with PostgreSQL for all control-plane metadata.
SQLite is not supported.

## Database boundary

The control plane and LiteLLM use the same PostgreSQL instance and database:

- LiteLLM keeps its tables and migration history in `public`.
- TaskLattice Relay keeps its tables and Prisma migration history in the
  compatibility `tasklattice` schema. The stable schema name is intentionally
  not shortened because existing deployments already persist data there.
- Every Project-owned control record includes `project_id`.
- Project-scoped API routes use `/api/v1/projects/{projectId}/...`; stores apply
  that Project scope internally instead of accepting ad hoc page-level filters.

The shared instance reduces deployment and backup overhead. Separate schemas
prevent table and migration-name collisions, but do not isolate CPU, memory,
connections, storage, or failure domains. Production deployments should set
connection limits, monitor both workloads, and back up the whole database.

## Initialization

`prisma migrate deploy` is the only initialization path. The first migration
creates the schema and tables. A following idempotent SQL migration inserts:

- the local administrator, bootstrap Project, and administrator membership;
- built-in Skills, MCP servers, Knowledge Base sources, specializations, and
  sandbox policies.

Helm runs migrations in the control Deployment init container before the
application starts. On the first Local login, runtime initialization copies
the configured initial Super Administrator bcrypt hash into
`local_credentials` only when that database credential is missing.

New users do not receive an automatically generated Project. A Project is
created explicitly or becomes available through membership. New Projects are
initialized from the built-in resource and sandbox-policy catalogs embedded in
the Control application.

For local development:

```sh
cp control.example.toml control.toml
# Set database.url in control.toml for the local PostgreSQL instance.
export TALI_CONFIG="$PWD/control.toml"
npm run db:migrate --workspace @tali/control
npm run dev --workspace @tali/control
```
