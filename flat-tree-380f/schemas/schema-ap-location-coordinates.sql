ALTER TABLE ap_locations ADD COLUMN latitude REAL;
ALTER TABLE ap_locations ADD COLUMN longitude REAL;
ALTER TABLE ap_locations ADD COLUMN location_accuracy_m REAL;
ALTER TABLE ap_locations ADD COLUMN location_captured_at TEXT;
