ALTER TABLE servers ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE servers ADD COLUMN active_source TEXT NOT NULL DEFAULT 'manual';
UPDATE servers SET active_updated_at = datetime('now') WHERE active_updated_at IS NULL;
