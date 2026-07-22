CREATE TABLE IF NOT EXISTS servers (
  server      TEXT PRIMARY KEY,
  version     TEXT NOT NULL DEFAULT '3.0',
  hostname    TEXT,
  notes       TEXT,
  updated_at  TEXT DEFAULT (datetime('now'))
);