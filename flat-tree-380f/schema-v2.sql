-- Recreate calibrations with composite unique key
CREATE TABLE IF NOT EXISTS calibrations_new (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  sensor_id     TEXT NOT NULL,
  cp_address    TEXT,
  sensor_name   TEXT,
  serial_number TEXT,
  old_offset    REAL,
  new_offset    REAL,
  access_point  TEXT,
  quality       TEXT,
  status        TEXT,
  sensor_type   TEXT,
  zone          TEXT,
  calibrated_at TEXT,
  calibrated_by TEXT,
  server        TEXT,
  cal_cert      TEXT,
  canned_msg    TEXT,
  captured_at   TEXT DEFAULT (datetime('now')),
  UNIQUE(sensor_id, server)
);

INSERT INTO calibrations_new SELECT * FROM calibrations;
DROP TABLE calibrations;
ALTER TABLE calibrations_new RENAME TO calibrations;