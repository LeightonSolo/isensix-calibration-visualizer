-- Repair the Baylor duplicate caused by a trailing space in job_name.
-- Preview the rows first. Run this against D1 only after reviewing the result.
SELECT id, quote(customer) AS customer, quote(job_name) AS job_name,
       last_calibrated, updated_at
FROM job_info
WHERE lower(trim(job_name)) = lower(trim('Baylor College of Medicine'))
ORDER BY id;


-- Prefer the record referenced by calendar events; otherwise retain the oldest row.
CREATE TEMP TABLE baylor_job_info_merge AS
SELECT duplicate.id AS duplicate_id,
       (
         SELECT candidate.id
         FROM job_info candidate
         WHERE lower(trim(candidate.job_name)) = lower(trim(duplicate.job_name))
         ORDER BY CASE WHEN EXISTS (
           SELECT 1 FROM calendar_events event WHERE event.job_info_id = candidate.id
         ) THEN 0 ELSE 1 END, candidate.id ASC
         LIMIT 1
       ) AS canonical_id
FROM job_info duplicate
WHERE lower(trim(duplicate.job_name)) = lower(trim('Baylor College of Medicine'))
  AND duplicate.id <> (
    SELECT candidate.id
    FROM job_info candidate
    WHERE lower(trim(candidate.job_name)) = lower(trim(duplicate.job_name))
    ORDER BY CASE WHEN EXISTS (
      SELECT 1 FROM calendar_events event WHERE event.job_info_id = candidate.id
    ) THEN 0 ELSE 1 END, candidate.id ASC
    LIMIT 1
  );

-- Keep the most recently supplied calibration date from the duplicate group.
UPDATE job_info
SET last_calibrated = (
  SELECT MAX(source.last_calibrated)
  FROM job_info source
  WHERE lower(trim(source.job_name)) = lower(trim(job_info.job_name))
)
WHERE id IN (SELECT canonical_id FROM baylor_job_info_merge);

UPDATE calendar_events
SET job_info_id = (
  SELECT canonical_id FROM baylor_job_info_merge
  WHERE duplicate_id = calendar_events.job_info_id
)
WHERE job_info_id IN (SELECT duplicate_id FROM baylor_job_info_merge);

DELETE FROM job_info
WHERE id IN (SELECT duplicate_id FROM baylor_job_info_merge);

DROP TABLE baylor_job_info_merge;
