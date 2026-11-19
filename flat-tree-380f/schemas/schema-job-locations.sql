-- Structured locations for the managerial Jobs map.
-- The legacy job_info.offsites field remains untouched and can continue to
-- hold free-form notes or Zeemaps links while these rows are added gradually.
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
