CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;

CREATE TABLE tasklattice.knowledge_vector_databases (
  project_id TEXT NOT NULL,
  id TEXT NOT NULL,
  vector_store_id TEXT NOT NULL,
  embedding_model TEXT NOT NULL,
  embedding_dimensions INTEGER NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT knowledge_vector_databases_pkey PRIMARY KEY (project_id, id),
  CONSTRAINT knowledge_vector_databases_dimensions_check
    CHECK (embedding_dimensions BETWEEN 1 AND 16000),
  CONSTRAINT knowledge_vector_databases_project_fkey
    FOREIGN KEY (project_id)
    REFERENCES tasklattice.projects(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT knowledge_vector_databases_source_fkey
    FOREIGN KEY (project_id, id)
    REFERENCES tasklattice.knowledge_sources(project_id, id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX knowledge_vector_databases_vector_store_key
  ON tasklattice.knowledge_vector_databases(project_id, vector_store_id);
CREATE UNIQUE INDEX knowledge_vector_databases_dimensions_key
  ON tasklattice.knowledge_vector_databases(project_id, id, embedding_dimensions);

CREATE TABLE tasklattice.knowledge_vector_chunks (
  project_id TEXT NOT NULL,
  database_id TEXT NOT NULL,
  id TEXT NOT NULL,
  content TEXT NOT NULL,
  filename TEXT NOT NULL,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  embedding_dimensions INTEGER NOT NULL,
  embedding public.vector NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT knowledge_vector_chunks_pkey PRIMARY KEY (project_id, database_id, id),
  CONSTRAINT knowledge_vector_chunks_embedding_dimensions_check
    CHECK (public.vector_dims(embedding) = embedding_dimensions),
  CONSTRAINT knowledge_vector_chunks_database_fkey
    FOREIGN KEY (project_id, database_id, embedding_dimensions)
    REFERENCES tasklattice.knowledge_vector_databases(project_id, id, embedding_dimensions)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX knowledge_vector_chunks_database_idx
  ON tasklattice.knowledge_vector_chunks(project_id, database_id);
CREATE INDEX knowledge_vector_chunks_attributes_idx
  ON tasklattice.knowledge_vector_chunks USING gin(attributes);
