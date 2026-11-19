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

CREATE TABLE IF NOT EXISTS physical_locations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  address       TEXT,
  latitude      REAL,
  longitude     REAL,
  location_source TEXT,
  access_hours  TEXT,
  contact_name  TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  notes         TEXT,
  updated_by    TEXT,
  created_at    TEXT DEFAULT (datetime('now')),
  updated_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ap_locations (
  server       TEXT NOT NULL,
  access_point TEXT NOT NULL,
  address      TEXT,
  floor        TEXT,
  room         TEXT,
  notes        TEXT,
  updated_by   TEXT,
  updated_at   TEXT DEFAULT (datetime('now')),
  latitude     REAL,
  longitude    REAL,
  location_accuracy_m REAL,
  location_captured_at TEXT,
  location_source TEXT,
  location_id   INTEGER,
  PRIMARY KEY (server, access_point)
);

CREATE INDEX IF NOT EXISTS idx_ap_locations_access_point
  ON ap_locations(access_point);

CREATE INDEX IF NOT EXISTS idx_ap_locations_location_id
  ON ap_locations(location_id);

CREATE TABLE IF NOT EXISTS job_locations (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  job_info_id         INTEGER NOT NULL,
  location_role       TEXT NOT NULL DEFAULT 'offsite',
  name                TEXT,
  address             TEXT,
  latitude            REAL,
  longitude           REAL,
  location_source     TEXT,
  physical_location_id INTEGER,
  notes               TEXT,
  updated_by          TEXT,
  created_at          TEXT DEFAULT (datetime('now')),
  updated_at          TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (job_info_id) REFERENCES job_info(id) ON DELETE CASCADE,
  FOREIGN KEY (physical_location_id) REFERENCES physical_locations(id)
);

CREATE INDEX IF NOT EXISTS idx_job_locations_job_info
  ON job_locations(job_info_id, location_role);

CREATE INDEX IF NOT EXISTS idx_job_locations_physical
  ON job_locations(physical_location_id);
