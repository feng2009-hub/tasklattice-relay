# Control-plane database

TaskLattice Relay uses Prisma ORM with PostgreSQL for all control-plane metadata.
SQLite is not supported.

## Database boundary

The control plane and LiteLLM use the same PostgreSQL instance and database:

- LiteLLM keeps its tables and migration history in `public`.
- TaskLattice Relay keeps its tables and Prisma migration history in the
  compatibility `tasklattice` schema. The stable schema name is intentionally
  not shortened because existing deployments already persist data there.
- The `vector` extension is installed in `public`. Built-in Knowledge Vector
  Databases keep their metadata and chunks in `tasklattice`, alongside the
  Project boundary that owns them.
- Every Project-owned control record includes `project_id`.
- Project-scoped API routes use `/api/v1/projects/{projectId}/...`; stores apply
  that Project scope internally instead of accepting ad hoc page-level filters.

The shared instance reduces deployment and backup overhead. Separate schemas
prevent table and migration-name collisions, but do not isolate CPU, memory,
connections, storage, or failure domains. Production deployments should set
connection limits, monitor both workloads, and back up the whole database.

## Built-in knowledge vectors

The `postgresql` Knowledge Base provider stores text chunks, JSON attributes,
and pgvector embeddings in `tasklattice.knowledge_vector_chunks`. The parent
`KnowledgeVectorDatabase` record fixes the LiteLLM embedding model and vector
dimensions for one Project-scoped Knowledge Base. Changing either setting is
rejected after the first chunk is stored, preventing mixed-dimensional data.

Search uses exact cosine distance initially. This gives deterministic recall
for small and medium knowledge collections and permits different embedding
dimensions across Knowledge Bases. Add per-database partial HNSW indexes only
after production cardinality and latency measurements justify the additional
memory, build time, and recall trade-off.

Administrators can ingest already chunked text through the Project API. Relay
calls the configured LiteLLM embedding model and upserts the resulting vectors
atomically for the batch:

```http
PUT /api/v1/projects/{projectId}/catalog/knowledge-sources/{sourceId}/chunks
Content-Type: application/json

{
  "chunks": [
    {
      "id": "runbook-42#rotation",
      "content": "Restart the service after rotating credentials.",
      "filename": "runbooks/credentials.md",
      "attributes": { "environment": "production" }
    }
  ]
}
```

Batches contain at most 128 chunks. Reusing a chunk ID replaces its content,
attributes, and embedding. Delete one chunk with
`DELETE .../chunks/{chunkId}`.

Project Administrators can also upload a PDF directly from the Knowledge Base
page or through `POST .../knowledge-sources/{sourceId}/documents` using a
multipart `file` field. Control validates a 25 MiB and 100-page limit, extracts
embedded text with Poppler, chunks each page, calls the selected Project-visible
LiteLLM embedding model, and writes the vectors. Scanned pages are rendered to
PNG and sent to NVIDIA Nemotron OCR v2. The OCR credential is resolved in this
order:

1. the stored credential behind a selected NVIDIA NIM embedding model,
2. `NVIDIA_API_KEY`,
3. the compatibility alias `NVAPI_API_KEY`.

Text PDFs require no NVIDIA credential. `NVIDIA_OCR_ENDPOINT` can point at a
self-hosted OCR NIM; hosted `*.nvidia.com` endpoints require a key. Re-uploading
the same filename replaces older content-hash revisions after the new vectors
have been written successfully.

The default Chart image includes pgvector. A custom PostgreSQL image must also
install the extension files before `prisma migrate deploy` runs; merely setting
`shared_preload_libraries` is neither necessary nor sufficient.

The default image change from PostgreSQL Alpine to the pgvector Debian image
also changes the container UID/GID from `70` to `999`. Existing persistent
volumes require a backed-up, rehearsed ownership migration during an explicit
maintenance window before the upgraded StatefulSet starts.

## Initialization

`prisma migrate deploy` is the only initialization path. The first migration
creates the schema and tables. A following idempotent SQL migration inserts:

- the local administrator, bootstrap Project, and administrator membership;
- built-in Skills, MCP servers, Knowledge Base sources, specializations, and
  sandbox policies.

Helm runs migrations in the control Deployment init container before the
application starts. Better Auth owns `auth_accounts`, `auth_sessions`, and
`auth_verifications`. On first startup with Local authentication enabled, the
configured bootstrap password is hashed into a Better Auth credential account
only when that credential is missing.

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
