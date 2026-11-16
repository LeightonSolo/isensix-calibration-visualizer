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
  calibrated_at TEXT NOT NULL,
  calibrated_by TEXT,
  server TEXT,
  cal_cert TEXT,
  canned_msg TEXT,
  captured_at TEXT DEFAULT (datetime('now')),
  UNIQUE(sensor_id, server)
);

CREATE INDEX IF NOT EXISTS idx_calibrations_server_calibrated_at
  ON calibrations(server, calibrated_at DESC);

CREATE TABLE IF NOT EXISTS ap_locations (
  server       TEXT NOT NULL,
  access_point TEXT NOT NULL,
  address      TEXT,
  floor        TEXT,
  room         TEXT,
  notes        TEXT,
  updated_by   TEXT,
  updated_at   TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (server, access_point)
);

CREATE INDEX IF NOT EXISTS idx_ap_locations_access_point
  ON ap_locations(access_point);
