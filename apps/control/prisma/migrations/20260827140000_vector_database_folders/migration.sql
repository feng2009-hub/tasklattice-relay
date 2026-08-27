CREATE TABLE tasklattice.vector_folders (
  project_id TEXT NOT NULL,
  database_id TEXT NOT NULL,
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  parent_id UUID,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT vector_folders_pkey PRIMARY KEY (project_id, database_id, id),
  CONSTRAINT vector_folders_database_fkey
    FOREIGN KEY (project_id, database_id)
    REFERENCES tasklattice.knowledge_vector_databases(project_id, id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT vector_folders_parent_fkey
    FOREIGN KEY (project_id, database_id, parent_id)
    REFERENCES tasklattice.vector_folders(project_id, database_id, id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT vector_folders_name_check
    CHECK (
      name = btrim(name)
      AND name <> ''
      AND name NOT IN ('.', '..')
      AND name NOT LIKE '%/%'
      AND name NOT LIKE E'%\\\\%'
      AND char_length(name) <= 240
    )
);

CREATE UNIQUE INDEX vector_folders_root_name_key
  ON tasklattice.vector_folders(project_id, database_id, name)
  WHERE parent_id IS NULL;

CREATE UNIQUE INDEX vector_folders_parent_name_key
  ON tasklattice.vector_folders(project_id, database_id, parent_id, name)
  WHERE parent_id IS NOT NULL;

CREATE INDEX vector_folders_parent_idx
  ON tasklattice.vector_folders(project_id, database_id, parent_id, updated_at DESC);

ALTER TABLE tasklattice.vector_documents
  ADD COLUMN folder_id UUID;

-- Preserve the logical directories introduced before first-class Folder rows.
-- IDs are deterministic so every prefix can refer to its parent in one insert.
WITH RECURSIVE source_paths AS (
  SELECT DISTINCT
    project_id,
    database_id,
    string_to_array(trim(both '/' FROM directory_path), '/') AS segments
  FROM tasklattice.vector_documents
  WHERE directory_path <> '/'
), folder_paths AS (
  SELECT project_id, database_id, segments, 1 AS depth
  FROM source_paths
  UNION ALL
  SELECT project_id, database_id, segments, depth + 1
  FROM folder_paths
  WHERE depth < array_length(segments, 1)
), distinct_folders AS (
  SELECT DISTINCT
    project_id,
    database_id,
    depth,
    segments[depth] AS name,
    '/' || array_to_string(segments[1:depth], '/') AS path,
    CASE
      WHEN depth = 1 THEN NULL
      ELSE '/' || array_to_string(segments[1:depth - 1], '/')
    END AS parent_path
  FROM folder_paths
)
INSERT INTO tasklattice.vector_folders (
  project_id,
  database_id,
  id,
  parent_id,
  name
)
SELECT
  project_id,
  database_id,
  md5(project_id || ':' || database_id || ':' || path)::uuid,
  CASE
    WHEN parent_path IS NULL THEN NULL
    ELSE md5(project_id || ':' || database_id || ':' || parent_path)::uuid
  END,
  name
FROM distinct_folders
ON CONFLICT DO NOTHING;

UPDATE tasklattice.vector_documents AS document
SET folder_id = md5(
  document.project_id || ':' || document.database_id || ':' || document.directory_path
)::uuid
WHERE document.directory_path <> '/';

ALTER TABLE tasklattice.vector_documents
  ADD CONSTRAINT vector_documents_folder_fkey
    FOREIGN KEY (project_id, database_id, folder_id)
    REFERENCES tasklattice.vector_folders(project_id, database_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX vector_documents_folder_idx
  ON tasklattice.vector_documents(project_id, database_id, folder_id, updated_at DESC);

UPDATE tasklattice.knowledge_vector_chunks AS chunk
SET attributes = chunk.attributes
  || jsonb_build_object(
    'folder_id', COALESCE(document.folder_id::text, 'root'),
    'file_name', document.filename,
    'file_path', CASE
      WHEN document.directory_path = '/' THEN '/' || document.filename
      ELSE document.directory_path || '/' || document.filename
    END
  )
FROM tasklattice.vector_documents AS document
WHERE document.project_id = chunk.project_id
  AND document.database_id = chunk.database_id
  AND document.id = chunk.document_id;
