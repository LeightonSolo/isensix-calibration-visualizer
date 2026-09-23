CREATE TABLE IF NOT EXISTS travel_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  job_info_id INTEGER NOT NULL REFERENCES job_info(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('hotel', 'car', 'flight')),
  technician  TEXT,
  status      TEXT NOT NULL DEFAULT 'needed' CHECK (status IN ('needed', 'booked', 'not_needed')),
  details     TEXT,
  notes       TEXT,
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_travel_items_job
  ON travel_items(job_info_id, kind, technician);
