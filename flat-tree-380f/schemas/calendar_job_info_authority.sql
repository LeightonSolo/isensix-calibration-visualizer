-- Run before deploying the Worker that derives Job Info scheduling from calendar events.
ALTER TABLE calendar_events ADD COLUMN job_info_id INTEGER REFERENCES job_info(id);
ALTER TABLE calendar_events ADD COLUMN source_calibration_date TEXT;

-- Existing calendar rows are linked only when their normalized title identifies
-- exactly one Job Info record. Unmatched rows remain valid standalone events.
UPDATE calendar_events AS event
SET job_info_id = (
  SELECT job.id
  FROM job_info AS job
  WHERE lower(trim(job.job_name)) = lower(trim(event.title))
)
WHERE event.event_type = 'calibration'
  AND event.job_info_id IS NULL
  AND 1 = (
    SELECT COUNT(*)
    FROM job_info AS job
    WHERE lower(trim(job.job_name)) = lower(trim(event.title))
  );

-- Verified legacy alias in the 2026-08-05 database snapshot.
UPDATE calendar_events
SET job_info_id = (
  SELECT id FROM job_info
  WHERE lower(trim(job_name)) = 'quest dallas, austin & san antonio'
)
WHERE event_type = 'calibration'
  AND job_info_id IS NULL
  AND lower(trim(title)) = 'quest dallas'
  AND 1 = (
    SELECT COUNT(*) FROM job_info
    WHERE lower(trim(job_name)) = 'quest dallas, austin & san antonio'
  );

CREATE INDEX IF NOT EXISTS idx_calendar_events_job_info
  ON calendar_events(job_info_id, event_type, start_date);

CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_events_calibration_cycle
  ON calendar_events(job_info_id, source_calibration_date)
  WHERE event_type = 'calibration' AND source_calibration_date IS NOT NULL;
