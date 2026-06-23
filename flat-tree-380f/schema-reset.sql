DROP TABLE IF EXISTS calibrations;

CREATE TABLE IF NOT EXISTS calibrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sensor_id TEXT NOT NULL,
  cp_address TEXT,
  sensor_name TEXT,
  serial_number TEXT,
  old_offset REAL,
  new_offset REAL,
  access_point TEXT,
  quality TEXT,
  status TEXT,
  sensor_type TEXT,
  zone TEXT,
  calibrated_at TEXT,
  calibrated_by TEXT,
  server TEXT,
  cal_cert TEXT,
  canned_msg TEXT,
  captured_at TEXT DEFAULT (datetime('now')),
  UNIQUE(sensor_id)
);