CREATE TABLE IF NOT EXISTS cms_server_inventory (
  customer_id             TEXT PRIMARY KEY,
  hostname                TEXT,
  profile                 TEXT NOT NULL,
  supplier_name           TEXT,
  sensor_count_guardian   INTEGER NOT NULL DEFAULT 0,
  sensor_count_arms       INTEGER NOT NULL DEFAULT 0,
  sensor_count            INTEGER NOT NULL DEFAULT 0,
  guardian_sensors        TEXT NOT NULL DEFAULT '[]',
  arms_sensors            TEXT NOT NULL DEFAULT '[]',
  meters                  TEXT,
  o2                      INTEGER NOT NULL DEFAULT 0,
  server_version          TEXT,
  hardware                TEXT,
  last_seen_at            TEXT NOT NULL,
  updated_at              TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cms_server_inventory_last_seen
  ON cms_server_inventory(last_seen_at);

CREATE TABLE IF NOT EXISTS cms_sync_runs (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at        TEXT NOT NULL,
  completed_at      TEXT,
  status            TEXT NOT NULL,
  servers_received  INTEGER NOT NULL DEFAULT 0,
  jobs_updated      INTEGER NOT NULL DEFAULT 0,
  unmatched_servers INTEGER NOT NULL DEFAULT 0,
  error_message     TEXT
);
