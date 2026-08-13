ALTER TABLE tasklattice.users
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en-US';

CREATE TABLE IF NOT EXISTS tasklattice.user_notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL
    REFERENCES tasklattice.users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info', 'success', 'warning', 'error')),
  action_href TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_notifications_user_created_idx
  ON tasklattice.user_notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS user_notifications_user_unread_idx
  ON tasklattice.user_notifications(user_id, read_at);
