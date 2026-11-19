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

ALTER TABLE ap_locations ADD COLUMN location_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_ap_locations_location_id
  ON ap_locations(location_id);
