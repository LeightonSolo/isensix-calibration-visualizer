-- Immutable calibration history.  The typed columns support filtering and
-- reporting; snapshot_json preserves the complete sensor payload so history
-- remains faithful when the live calibration schema gains new fields.
CREATE TABLE IF NOT EXISTS calibration_runs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  run_key         TEXT NOT NULL UNIQUE,
  job_name        TEXT,
  customer        TEXT,
  calibration_date TEXT,
  technician      TEXT,
  servers_json    TEXT NOT NULL DEFAULT '[]',
  status          TEXT NOT NULL DEFAULT 'complete',
  sensor_count    INTEGER NOT NULL DEFAULT 0,
  exception_count INTEGER NOT NULL DEFAULT 0,
  started_at      TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at    TEXT,
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_calibration_runs_customer_date
  ON calibration_runs(customer, calibration_date DESC);

CREATE TABLE IF NOT EXISTS calibration_run_sensors (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id          INTEGER NOT NULL REFERENCES calibration_runs(id) ON DELETE CASCADE,
  sensor_id       TEXT NOT NULL,
  cp_address      TEXT,
  sensor_name     TEXT,
  serial_number   TEXT,
  old_offset      REAL,
  new_offset      REAL,
  access_point    TEXT,
  quality         TEXT,
  status          TEXT,
  sensor_type     TEXT,
  zone            TEXT,
  calibrated_at   TEXT,
  calibrated_by   TEXT,
  server          TEXT,
  cal_cert        TEXT,
  canned_msg      TEXT,
  exception_reason TEXT,
  exception_year  INTEGER,
  snapshot_json   TEXT NOT NULL,
  captured_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(run_id, sensor_id, server)
);

CREATE INDEX IF NOT EXISTS idx_calibration_run_sensors_run
  ON calibration_run_sensors(run_id, server, calibrated_at DESC);
