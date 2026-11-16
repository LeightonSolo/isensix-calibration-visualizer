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
