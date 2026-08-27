ALTER TABLE tasklattice.vector_documents
  ADD COLUMN custom_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE tasklattice.vector_documents
  ADD CONSTRAINT vector_documents_custom_metadata_object_check
  CHECK (jsonb_typeof(custom_metadata) = 'object');
