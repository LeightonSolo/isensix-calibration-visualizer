-- Create new version of job_info
CREATE TABLE job_info (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Identity
  customer         TEXT,
  job_name         TEXT NOT NULL UNIQUE,

  -- Equipment
  servers          TEXT,
  sensors          INTEGER,
  meters           TEXT,
  o2               INTEGER,
  server_version   TEXT,
  hardware         TEXT,

  -- Scheduling
  num_tech         INTEGER,
  active           INTEGER DEFAULT 1,
  status           TEXT DEFAULT 'Unscheduled',
  estimated_days   INTEGER,
  scheduled_start_date TEXT,
  scheduled_end_date TEXT,
  scheduled_with   TEXT,

  -- Location
  site_address     TEXT,
  offsites         TEXT,

  -- Contacts
  main_contact     TEXT,
  other_contacts   TEXT,
  contact_notes    TEXT,

  -- Travel
  vpn_works        TEXT,
  airport_info     TEXT,
  emerald_aisle    TEXT,
  prev_hotel       TEXT,
  hotel_comments   TEXT,
  restaurants      TEXT,

  -- Documentation
  report           TEXT,
  credentials      TEXT,
  comments         TEXT,
  other_notes      TEXT,

  -- Metadata
  primary_tech     TEXT,
  updated_at       TEXT DEFAULT (datetime('now'))
);
