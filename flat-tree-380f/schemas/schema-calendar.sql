CREATE TABLE calendar_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
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