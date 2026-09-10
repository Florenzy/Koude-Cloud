CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires ON sessions(expires);
CREATE TABLE IF NOT EXISTS auth_limits (
  key TEXT PRIMARY KEY,
  bucket BIGINT NOT NULL,
  attempts INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('file','folder')),
  mime TEXT NOT NULL DEFAULT '',
  size INTEGER NOT NULL DEFAULT 0 CHECK (size >= 0),
  parent TEXT REFERENCES entries(id) ON DELETE RESTRICT,
  starred INTEGER NOT NULL DEFAULT 0 CHECK (starred IN (0,1)),
  trashed INTEGER NOT NULL DEFAULT 0 CHECK (trashed IN (0,1)),
  created TEXT NOT NULL,
  updated TEXT NOT NULL,
  share_token TEXT UNIQUE,
  share_expires BIGINT
);
CREATE INDEX IF NOT EXISTS entries_owner_parent ON entries(owner,parent);
