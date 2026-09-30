CREATE TABLE IF NOT EXISTS cms_sensor_snapshots (
  snapshot_date          TEXT PRIMARY KEY,
  captured_at            TEXT NOT NULL,
  cms_sync_run_id        INTEGER,
  active_servers         INTEGER NOT NULL DEFAULT 0,
  total_active_sensors   INTEGER NOT NULL DEFAULT 0,
  guardian_sensors       INTEGER NOT NULL DEFAULT 0,
  arms_sensors            INTEGER NOT NULL DEFAULT 0,
  unknown_sensors         INTEGER NOT NULL DEFAULT 0,
  servers_seen            INTEGER NOT NULL DEFAULT 0,
  servers_missing         INTEGER NOT NULL DEFAULT 0,
  profile_a_servers       INTEGER NOT NULL DEFAULT 0,
  profile_n_servers       INTEGER NOT NULL DEFAULT 0,
  sync_complete           INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_cms_sensor_snapshots_captured_at
  ON cms_sensor_snapshots(captured_at);
