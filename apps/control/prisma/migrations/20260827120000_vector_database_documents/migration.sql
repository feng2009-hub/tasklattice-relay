CREATE TABLE tasklattice.vector_documents (
  project_id TEXT NOT NULL,
  database_id TEXT NOT NULL,
  id TEXT NOT NULL,
  filename TEXT NOT NULL,
  media_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'QUEUED',
  active_revision INTEGER NOT NULL DEFAULT 1,
  page_count INTEGER NOT NULL DEFAULT 0,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  ocr_page_count INTEGER NOT NULL DEFAULT 0,
  parser TEXT NOT NULL DEFAULT 'docling',
  uploaded_by TEXT,
  error TEXT,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT vector_documents_pkey PRIMARY KEY (project_id, database_id, id),
  CONSTRAINT vector_documents_database_fkey
    FOREIGN KEY (project_id, database_id)
    REFERENCES tasklattice.knowledge_vector_databases(project_id, id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT vector_documents_project_fkey
    FOREIGN KEY (project_id)
    REFERENCES tasklattice.projects(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT vector_documents_status_check
    CHECK (status IN ('QUEUED', 'PARSING', 'EMBEDDING', 'READY', 'FAILED')),
  CONSTRAINT vector_documents_counts_check
    CHECK (byte_size > 0 AND active_revision > 0 AND page_count >= 0 AND chunk_count >= 0 AND ocr_page_count >= 0),
  CONSTRAINT vector_documents_parser_check CHECK (parser = 'docling')
);

CREATE INDEX vector_documents_database_status_idx
  ON tasklattice.vector_documents(project_id, database_id, status, updated_at);

CREATE TABLE tasklattice.vector_document_revisions (
  project_id TEXT NOT NULL,
  database_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  source_bytes BYTEA,
  docling_document JSONB,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ(6),
  CONSTRAINT vector_document_revisions_pkey
    PRIMARY KEY (project_id, database_id, document_id, revision),
  CONSTRAINT vector_document_revisions_content_key
    UNIQUE (project_id, database_id, document_id, revision, content_hash),
  CONSTRAINT vector_document_revisions_document_fkey
    FOREIGN KEY (project_id, database_id, document_id)
    REFERENCES tasklattice.vector_documents(project_id, database_id, id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT vector_document_revisions_revision_check CHECK (revision > 0)
);

CREATE TABLE tasklattice.vector_ingestion_jobs (
  id UUID NOT NULL,
  project_id TEXT NOT NULL,
  database_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  queue_job_id UUID,
  status TEXT NOT NULL DEFAULT 'QUEUED',
  phase TEXT NOT NULL DEFAULT 'QUEUED',
  progress INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  started_at TIMESTAMPTZ(6),
  completed_at TIMESTAMPTZ(6),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT vector_ingestion_jobs_pkey PRIMARY KEY (id),
  CONSTRAINT vector_ingestion_jobs_project_fkey
    FOREIGN KEY (project_id)
    REFERENCES tasklattice.projects(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT vector_ingestion_jobs_database_fkey
    FOREIGN KEY (project_id, database_id)
    REFERENCES tasklattice.knowledge_vector_databases(project_id, id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT vector_ingestion_jobs_document_fkey
    FOREIGN KEY (project_id, database_id, document_id)
    REFERENCES tasklattice.vector_documents(project_id, database_id, id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT vector_ingestion_jobs_revision_fkey
    FOREIGN KEY (project_id, database_id, document_id, revision)
    REFERENCES tasklattice.vector_document_revisions(project_id, database_id, document_id, revision)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT vector_ingestion_jobs_status_check
    CHECK (status IN ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED')),
  CONSTRAINT vector_ingestion_jobs_phase_check
    CHECK (phase IN ('QUEUED', 'PARSING', 'EMBEDDING', 'FINALIZING', 'COMPLETED', 'FAILED')),
  CONSTRAINT vector_ingestion_jobs_progress_check CHECK (progress BETWEEN 0 AND 100),
  CONSTRAINT vector_ingestion_jobs_attempts_check CHECK (attempts >= 0)
);

CREATE INDEX vector_ingestion_jobs_database_idx
  ON tasklattice.vector_ingestion_jobs(project_id, database_id, created_at);
CREATE INDEX vector_ingestion_jobs_status_idx
  ON tasklattice.vector_ingestion_jobs(project_id, status, updated_at);

ALTER TABLE tasklattice.knowledge_vector_chunks
  ADD COLUMN document_id TEXT,
  ADD COLUMN document_revision INTEGER,
  ADD COLUMN page_number INTEGER,
  ADD COLUMN chunk_index INTEGER,
  ADD COLUMN token_count INTEGER,
  ADD COLUMN section_path TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN label TEXT,
  ADD CONSTRAINT knowledge_vector_chunks_document_fkey
    FOREIGN KEY (project_id, database_id, document_id, document_revision)
    REFERENCES tasklattice.vector_document_revisions(project_id, database_id, document_id, revision)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT knowledge_vector_chunks_document_pair_check
    CHECK ((document_id IS NULL) = (document_revision IS NULL)),
  ADD CONSTRAINT knowledge_vector_chunks_page_check CHECK (page_number IS NULL OR page_number > 0),
  ADD CONSTRAINT knowledge_vector_chunks_index_check CHECK (chunk_index IS NULL OR chunk_index >= 0),
  ADD CONSTRAINT knowledge_vector_chunks_token_check CHECK (token_count IS NULL OR token_count >= 0);

CREATE INDEX knowledge_vector_chunks_document_idx
  ON tasklattice.knowledge_vector_chunks(project_id, database_id, document_id, document_revision);
