CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_history
ON calendar_events(title, start_date, end_date);