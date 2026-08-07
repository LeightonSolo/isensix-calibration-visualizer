-- Import normalized job_info schedules into the calendar.
--
-- Safe to rerun: existing events and assignments are protected by unique
-- constraints. The first two statements only target rows created by the old
-- last_calibrated-minus-five-days import.

-- Remove assignments attached to the old estimated event ranges before those
-- ranges are corrected. This currently affects one AmeriPath Irving row.
DELETE FROM event_assignments
WHERE event_id IN (
    SELECT ce.id
    FROM calendar_events AS ce
    JOIN job_info_calendar_import AS src
      ON src.job_name = ce.title
     AND ce.start_date = date(src.last_calibrated, '-5 days')
     AND ce.end_date = date(src.last_calibrated)
);

-- Correct events created by the earlier estimated-date import.
UPDATE calendar_events AS ce
SET
    customer = coalesce(ce.customer, src.customer),
    start_date = src.start_date,
    end_date = src.end_date,
    status = 'booked',
    updated_at = datetime('now')
FROM job_info_calendar_import AS src
WHERE ce.title = src.job_name
  AND ce.start_date = date(src.last_calibrated, '-5 days')
  AND ce.end_date = date(src.last_calibrated);

-- Insert normalized schedules that do not already have an exact calendar row.
INSERT OR IGNORE INTO calendar_events (
    title,
    event_type,
    status,
    customer,
    start_date,
    end_date,
    ticket_id,
    notes
)
SELECT
    src.job_name,
    'calibration',
    'booked',
    src.customer,
    src.start_date,
    src.end_date,
    NULL,
    'Imported from job_info'
FROM job_info_calendar_import AS src;

-- Split comma-separated technician names and assign each recognized technician
-- to every weekday in the event range. "Not Scheduled" and unknown values such
-- as DG are intentionally ignored.
WITH RECURSIVE
dates (job_name, start_date, end_date, assignment_date) AS (
    SELECT job_name, start_date, end_date, start_date
    FROM job_info_calendar_import

    UNION ALL

    SELECT job_name, start_date, end_date, date(assignment_date, '+1 day')
    FROM dates
    WHERE assignment_date < end_date
),
tokens (job_name, start_date, end_date, remaining, tech_name) AS (
    SELECT
        job_name,
        start_date,
        end_date,
        trim(scheduled_with) || ',',
        NULL
    FROM job_info_calendar_import
    WHERE scheduled_with IS NOT NULL
      AND trim(scheduled_with) <> ''

    UNION ALL

    SELECT
        job_name,
        start_date,
        end_date,
        substr(remaining, instr(remaining, ',') + 1),
        trim(substr(remaining, 1, instr(remaining, ',') - 1))
    FROM tokens
    WHERE remaining <> ''
),
recognized_techs AS (
    SELECT DISTINCT job_name, start_date, end_date, tech_name
    FROM tokens
    WHERE tech_name IN (
        'Daniel',
        'Dejan',
        'Leighton',
        'Joey',
        'Kyle',
        'Matt',
        'Fernando',
        'Bissen'
    )
)
INSERT OR IGNORE INTO event_assignments (event_id, tech_name, date)
SELECT
    ce.id,
    tech.tech_name,
    dates.assignment_date
FROM recognized_techs AS tech
JOIN dates
  ON dates.job_name = tech.job_name
 AND dates.start_date = tech.start_date
 AND dates.end_date = tech.end_date
JOIN calendar_events AS ce
  ON ce.title = tech.job_name
 AND ce.start_date = tech.start_date
 AND ce.end_date = tech.end_date
WHERE strftime('%w', dates.assignment_date) NOT IN ('0', '6');
