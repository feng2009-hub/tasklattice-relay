ALTER TABLE tasklattice.vector_documents
  ADD COLUMN directory_path TEXT NOT NULL DEFAULT '/';

CREATE INDEX vector_documents_directory_idx
  ON tasklattice.vector_documents(project_id, database_id, directory_path);

ALTER TABLE tasklattice.vector_documents
  ADD CONSTRAINT vector_documents_directory_path_check
  CHECK (
    directory_path = '/'
    OR (
      directory_path LIKE '/%'
      AND directory_path NOT LIKE '%//%'
      AND directory_path NOT LIKE '%/'
      AND char_length(directory_path) <= 2000
    )
  );
