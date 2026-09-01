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
  updated_at  TEXT DEFAULT (datetime('now'))
);
