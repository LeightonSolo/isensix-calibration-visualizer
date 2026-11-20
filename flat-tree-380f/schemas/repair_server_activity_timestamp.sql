-- Use this repair only when add_server_activity.sql already added
-- active and active_source before failing on the timestamp column.
ALTER TABLE servers ADD COLUMN active_updated_at TEXT;
UPDATE servers SET active_updated_at = datetime('now') WHERE active_updated_at IS NULL;
