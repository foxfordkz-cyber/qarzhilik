ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS academy_access (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','revoked')),
  requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at INTEGER,
  granted_by INTEGER REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS academy_progress (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  position_seconds INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(user_id, lesson)
);
CREATE TABLE IF NOT EXISTS academy_videos (
  lesson TEXT PRIMARY KEY,
  object_key TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS academy_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER NOT NULL REFERENCES users(id),
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS auth_limits (
  bucket TEXT PRIMARY KEY,
  hits INTEGER NOT NULL,
  resets_at INTEGER NOT NULL
);
