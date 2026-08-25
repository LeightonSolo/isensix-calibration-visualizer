-- Unassigned is derived by the calendar UI whenever an event date has no
-- technician assignment. It must not be stored as a technician name.
DELETE FROM event_assignments
WHERE lower(trim(tech_name)) = 'unassigned';
