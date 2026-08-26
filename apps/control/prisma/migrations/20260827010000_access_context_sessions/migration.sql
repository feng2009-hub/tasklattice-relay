CREATE TYPE tasklattice.access_context_level AS ENUM (
  'PLATFORM',
  'DEPARTMENT',
  'PROJECT'
);

CREATE TABLE tasklattice.access_context_sessions (
  session_id TEXT PRIMARY KEY,
  level tasklattice.access_context_level NOT NULL,
  resource_id TEXT,
  role_id TEXT NOT NULL,
  selected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT access_context_sessions_session_fkey
    FOREIGN KEY (session_id)
    REFERENCES tasklattice.auth_sessions(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT access_context_sessions_scope_check CHECK (
    (level = 'PLATFORM' AND resource_id IS NULL AND role_id = 'ROLE_PLATFORM_ADMIN')
    OR
    (level = 'DEPARTMENT' AND resource_id IS NOT NULL AND role_id = 'ROLE_DEPARTMENT_ADMIN')
    OR
    (level = 'PROJECT' AND resource_id IS NOT NULL AND role_id IN (
      'ROLE_PROJECT_ADMIN',
      'ROLE_AUDITOR',
      'ROLE_AGENT_DEVELOPER',
      'ROLE_USER',
      'ROLE_REVIEWER'
    ))
  )
);

CREATE INDEX access_context_sessions_level_resource_idx
  ON tasklattice.access_context_sessions(level, resource_id);
