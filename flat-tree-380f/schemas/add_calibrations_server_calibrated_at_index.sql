-- Supports the hot calibration read:
--   WHERE server = ? ORDER BY calibrated_at DESC LIMIT ?
--
-- The existing UNIQUE(sensor_id, server) index cannot efficiently serve a
-- query that begins with server because server is not its leftmost column.
CREATE INDEX IF NOT EXISTS idx_calibrations_server_calibrated_at
  ON calibrations(server, calibrated_at DESC);

-- Refresh planner statistics after adding the index.
PRAGMA optimize;
