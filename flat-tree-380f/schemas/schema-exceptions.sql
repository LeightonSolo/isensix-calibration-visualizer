CREATE TABLE IF NOT EXISTS exceptions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  sensor_id   TEXT NOT NULL,
  server      TEXT NOT NULL,
  sensor_name TEXT,
  zone        TEXT,
  reason      TEXT NOT NULL,
  year        INTEGER NOT NULL,
  added_by    TEXT,
  added_at    TEXT DEFAULT (datetime('now')),
  UNIQUE(sensor_id, server, year)
);