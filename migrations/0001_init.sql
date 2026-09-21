-- QARZHЫ: пайдаланушылар, сессиялар, курсқа жазылу және прогресс

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  email         TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  salt          TEXT    NOT NULL,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT    PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS enrollments (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course     TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, course)
);

CREATE TABLE IF NOT EXISTS progress (
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course       TEXT    NOT NULL,
  topic        TEXT    NOT NULL,
  quiz_score   INTEGER,
  quiz_total   INTEGER,
  completed_at TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, course, topic)
);
