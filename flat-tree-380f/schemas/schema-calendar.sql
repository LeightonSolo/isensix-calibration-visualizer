CREATE TABLE calendar_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  job_info_id INTEGER REFERENCES job_info(id),
  source_calibration_date TEXT,
  title       TEXT NOT NULL,
  event_type  TEXT NOT NULL DEFAULT 'calibration',
  status      TEXT NOT NULL DEFAULT 'ticketed',
  customer    TEXT,
  start_date  TEXT NOT NULL,
  end_date    TEXT NOT NULL,
  ticket_id   TEXT,
  notes       TEXT,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_calendar_events_job_info
  ON calendar_events(job_info_id, event_type, start_date);

CREATE UNIQUE INDEX idx_calendar_events_calibration_cycle
  ON calendar_events(job_info_id, source_calibration_date)
  WHERE event_type = 'calibration' AND source_calibration_date IS NOT NULL;

CREATE TABLE event_assignments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id    INTEGER NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  tech_name   TEXT NOT NULL,
  date        TEXT NOT NULL,
  UNIQUE(event_id, tech_name, date)
);

CREATE TABLE tech_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  tech_name   TEXT NOT NULL,
  event_type  TEXT NOT NULL,
  date        TEXT NOT NULL,
  notes       TEXT,
  UNIQUE(tech_name, date)
);
