-- Run only after the calendar-authoritative Worker and static UI are deployed.
-- The former import view depends on these legacy columns.
DROP VIEW IF EXISTS job_info_calendar_import;

ALTER TABLE job_info DROP COLUMN status;
ALTER TABLE job_info DROP COLUMN scheduled_start_date;
ALTER TABLE job_info DROP COLUMN scheduled_end_date;
ALTER TABLE job_info DROP COLUMN scheduled_with;
