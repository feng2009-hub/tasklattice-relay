# Control-plane database

TaskLattice uses Prisma ORM with PostgreSQL for all control-plane metadata.
SQLite is not supported.

## Database boundary

The control plane and LiteLLM use the same PostgreSQL instance and database:

- LiteLLM keeps its tables and migration history in `public`.
- TaskLattice keeps its tables and Prisma migration history in `tasklattice`.
- Every workspace-owned control record includes `workspace_id`.
- API requests resolve membership from `X-Workspace-ID`; stores apply that
  workspace scope internally instead of accepting ad hoc page-level filters.

The shared instance reduces deployment and backup overhead. Separate schemas
prevent table and migration-name collisions, but do not isolate CPU, memory,
connections, storage, or failure domains. Production deployments should set
connection limits, monitor both workloads, and back up the whole database.

## Initialization

`prisma migrate deploy` is the only initialization path. The first migration
creates the schema and tables. A following idempotent SQL migration inserts:

- the local administrator, Individual workspace, and owner membership;
- built-in Skills, MCP servers, Knowledge Base sources, specializations, and
  sandbox policies.

Helm runs migrations in the control Deployment init container before the
application starts. Runtime code does not seed from TypeScript, YAML,
ConfigMaps, or local files.

For local development:

```sh
export TALI_DATABASE_URL='postgresql://postgres:postgres@localhost:5432/tasklattice'
npm run db:migrate --workspace @tasklattice/control
npm run dev --workspace @tasklattice/control
```

To regenerate the checked-in SQL seed migration after deliberately changing
the development catalogs:

```sh
npm run db:generate-seed --workspace @tasklattice/control
```

Review the generated SQL before committing it. Existing applied migrations
must remain immutable; create a new migration for later catalog changes.
