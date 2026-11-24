-- Adds the editor identity needed for operational calendar accountability.
-- Apply once to the existing calibration-db before deploying the Worker changes.
ALTER TABLE calendar_events ADD COLUMN updated_by TEXT;
ALTER TABLE tech_events ADD COLUMN updated_at TEXT;
ALTER TABLE tech_events ADD COLUMN updated_by TEXT;

UPDATE tech_events
SET updated_at = COALESCE(updated_at, datetime('now'))
WHERE updated_at IS NULL;
