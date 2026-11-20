CREATE TABLE IF NOT EXISTS servers (
  server      TEXT PRIMARY KEY,
  version     TEXT NOT NULL DEFAULT '3.0',
  hostname    TEXT,
  calibration_path TEXT CHECK (
    calibration_path IS NULL OR
    calibration_path IN ('/arms2/calsensor.php', '/arms/calsensor.php')
  ),
  notes       TEXT,
  customer    TEXT,
  active      INTEGER NOT NULL DEFAULT 1,
  active_source TEXT NOT NULL DEFAULT 'manual',
  active_updated_at TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);
