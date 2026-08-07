-- Normalize legacy scheduling fields in job_info.
--
-- This migration intentionally retains scheduled_date because the currently
-- deployed Worker still reads and writes that legacy field. Remove it only
-- after the Worker has been migrated to scheduled_start_date and
-- scheduled_end_date.

ALTER TABLE job_info ADD COLUMN scheduled_start_date TEXT;
ALTER TABLE job_info ADD COLUMN scheduled_end_date TEXT;

-- Convert M/D/YY - M/D/YY ranges to ISO-8601 dates. Sentinel values such as
-- "Not on Calendar" remain represented by NULL start/end dates.
WITH raw_ranges AS (
    SELECT
        id,
        trim(substr(scheduled_date, 1, instr(scheduled_date, '-') - 1)) AS start_raw,
        trim(substr(scheduled_date, instr(scheduled_date, '-') + 1)) AS end_raw
    FROM job_info
    WHERE scheduled_date IS NOT NULL
      AND trim(scheduled_date) <> ''
      AND instr(scheduled_date, '-') > 0
      AND length(scheduled_date) - length(replace(scheduled_date, '/', '')) = 4
),
date_tails AS (
    SELECT
        id,
        substr(start_raw, 1, instr(start_raw, '/') - 1) AS start_month,
        substr(start_raw, instr(start_raw, '/') + 1) AS start_tail,
        substr(end_raw, 1, instr(end_raw, '/') - 1) AS end_month,
        substr(end_raw, instr(end_raw, '/') + 1) AS end_tail
    FROM raw_ranges
),
date_parts AS (
    SELECT
        id,
        start_month,
        substr(start_tail, 1, instr(start_tail, '/') - 1) AS start_day,
        substr(start_tail, instr(start_tail, '/') + 1) AS start_year,
        end_month,
        substr(end_tail, 1, instr(end_tail, '/') - 1) AS end_day,
        substr(end_tail, instr(end_tail, '/') + 1) AS end_year
    FROM date_tails
),
normalized AS (
    SELECT
        id,
        printf(
            '%04d-%02d-%02d',
            CASE
                WHEN CAST(start_year AS INTEGER) < 100
                    THEN CAST(start_year AS INTEGER) + 2000
                ELSE CAST(start_year AS INTEGER)
            END,
            CAST(start_month AS INTEGER),
            CAST(start_day AS INTEGER)
        ) AS start_date,
        printf(
            '%04d-%02d-%02d',
            CASE
                WHEN CAST(end_year AS INTEGER) < 100
                    THEN CAST(end_year AS INTEGER) + 2000
                ELSE CAST(end_year AS INTEGER)
            END,
            CAST(end_month AS INTEGER),
            CAST(end_day AS INTEGER)
        ) AS end_date
    FROM date_parts
)
UPDATE job_info
SET
    scheduled_start_date = (
        SELECT start_date
        FROM normalized
        WHERE normalized.id = job_info.id
    ),
    scheduled_end_date = (
        SELECT end_date
        FROM normalized
        WHERE normalized.id = job_info.id
    ),
    updated_at = datetime('now')
WHERE id IN (SELECT id FROM normalized);

-- Expand comma-separated initials, map known codes, and put the names back in
-- their original order. Unknown values (currently DG) and sentinel values are
-- preserved so that no source information is discarded.
WITH RECURSIVE split AS (
    SELECT
        id,
        0 AS position,
        '' AS token,
        trim(scheduled_with) || ',' AS remaining
    FROM job_info
    WHERE scheduled_with IS NOT NULL
      AND trim(scheduled_with) <> ''

    UNION ALL

    SELECT
        id,
        position + 1,
        trim(substr(remaining, 1, instr(remaining, ',') - 1)),
        substr(remaining, instr(remaining, ',') + 1)
    FROM split
    WHERE remaining <> ''
),
mapped AS (
    SELECT
        id,
        position,
        CASE upper(token)
            WHEN 'DR' THEN 'Daniel'
            WHEN 'DM' THEN 'Dejan'
            WHEN 'LS' THEN 'Leighton'
            WHEN 'JB' THEN 'Joey'
            WHEN 'KC' THEN 'Kyle'
            WHEN 'MD' THEN 'Matt'
            WHEN 'FC' THEN 'Fernando'
            WHEN 'BC' THEN 'Bissen'
            ELSE token
        END AS full_name
    FROM split
    WHERE token <> ''
),
combined AS (
    SELECT
        ids.id,
        (
            SELECT group_concat(ordered.full_name, ', ')
            FROM (
                SELECT full_name
                FROM mapped
                WHERE mapped.id = ids.id
                ORDER BY position
            ) AS ordered
        ) AS full_names
    FROM (SELECT DISTINCT id FROM mapped) AS ids
)
UPDATE job_info
SET
    scheduled_with = (
        SELECT full_names
        FROM combined
        WHERE combined.id = job_info.id
    ),
    updated_at = datetime('now')
WHERE id IN (SELECT id FROM combined);
