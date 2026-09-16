CREATE TABLE IF NOT EXISTS cms_unassigned_server_reasons (
  server       TEXT PRIMARY KEY,
  name         TEXT,
  comments     TEXT NOT NULL,
  active       INTEGER NOT NULL DEFAULT 1,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO cms_unassigned_server_reasons (server, name, comments) VALUES
  ('105', 'Mayo Arizona', 'No Calibrations'),
  ('111', 'Mayo Arizona', 'No Calibrations'),
  ('148', 'Mayo Arizona', 'No Calibrations'),
  ('183', 'Mayo Rochester Server 3 VM', 'No Calibrations'),
  ('265', 'VA Miami (VM Upgrade)', 'New server, just 1 sensor'),
  ('267', NULL, 'Test Server'),
  ('275', NULL, 'Test Server'),
  ('276', NULL, 'Test Server'),
  ('288', NULL, 'Test Server'),
  ('289', 'Mayo Rochester (Server 9)', 'No Calibrations'),
  ('293', NULL, 'Test Server'),
  ('347', 'AGC Biologics (formerly CMC ICOS) - (New ARMS VM)', 'No Calibrations'),
  ('348', NULL, 'Test Server'),
  ('407', 'Quest Chantilly (G3.0 VM1)', 'New server, just 1 sensor'),
  ('427', 'Noveome (New VM)', 'No Calibrations??'),
  ('683', 'Fralin Riverside Bldgs (VM)', 'No Calibrations'),
  ('693', 'Duke Marcus Center for Cellular Cures (MC3)', 'No Calibrations'),
  ('700', 'OneBlood - SIM (VM)', 'No Calibrations'),
  ('755', 'Immucor Gamma', 'No Calibrations'),
  ('820', 'AGC Biologics', 'New server, just 1 sensor'),
  ('958', 'Q2 Solutions (formerly Quest Valencia) (2.1 Prod)', 'No Calibrations'),
  ('970', 'Sangamo Therapeutics', 'No Calibrations')
ON CONFLICT(server) DO UPDATE SET
  name = excluded.name,
  comments = excluded.comments,
  active = 1,
  updated_at = datetime('now');
