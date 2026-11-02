-- Adds a reusable Flex assignment column while preserving the person assigned
-- to historical Matt jobs and technician events.
ALTER TABLE event_assignments ADD COLUMN person_name TEXT;
ALTER TABLE tech_events ADD COLUMN person_name TEXT;

UPDATE event_assignments
SET tech_name = 'Flex', person_name = 'Matt'
WHERE lower(trim(tech_name)) = 'matt';

UPDATE tech_events
SET tech_name = 'Flex', person_name = 'Matt'
WHERE lower(trim(tech_name)) = 'matt';
