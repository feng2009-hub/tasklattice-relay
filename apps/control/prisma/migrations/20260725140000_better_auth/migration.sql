CREATE TYPE tasklattice.system_role AS ENUM ('user', 'super_administrator');
CREATE TYPE tasklattice.user_status AS ENUM ('active', 'disabled');

ALTER TABLE tasklattice.users
  ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN image TEXT,
  ADD COLUMN system_role tasklattice.system_role NOT NULL DEFAULT 'user',
  ADD COLUMN status tasklattice.user_status NOT NULL DEFAULT 'active';

UPDATE tasklattice.users
SET system_role = 'super_administrator'
WHERE id = 'local-admin';

ALTER TABLE tasklattice.users
  ALTER COLUMN username DROP NOT NULL,
  DROP COLUMN auth_provider,
  DROP COLUMN external_subject,
  DROP COLUMN password_hash;

CREATE TABLE tasklattice.auth_sessions (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ(6) NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  user_id TEXT NOT NULL REFERENCES tasklattice.users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX auth_sessions_user_id_idx
  ON tasklattice.auth_sessions(user_id);

CREATE TABLE tasklattice.auth_accounts (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  issuer TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES tasklattice.users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  access_token TEXT,
  refresh_token TEXT,
  id_token TEXT,
  access_token_expires_at TIMESTAMPTZ(6),
  refresh_token_expires_at TIMESTAMPTZ(6),
  scope TEXT,
  password TEXT,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT auth_accounts_issuer_account_id_key UNIQUE (issuer, account_id)
);

CREATE INDEX auth_accounts_user_id_idx
  ON tasklattice.auth_accounts(user_id);

CREATE TABLE tasklattice.auth_verifications (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at TIMESTAMPTZ(6) NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX auth_verifications_identifier_idx
  ON tasklattice.auth_verifications(identifier);
