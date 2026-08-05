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
    job_name,
    'calibration',
    'booked',
    customer,
    date(last_calibrated, '-5 days'),
    date(last_calibrated),
    NULL,
    NULL
FROM job_info
WHERE last_calibrated IS NOT NULL;