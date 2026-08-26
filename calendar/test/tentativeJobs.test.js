import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateTentativeJobs,
  materializeTentativeJob,
  normalizeTentativeCalendar,
} from '../src/utils/tentativeJobs.js';

const now = new Date(2026, 7, 21, 12);

test('projects active prior-year jobs onto the Monday of the completion week', () => {
  const jobs = {
    Alpha: {
      id: 10,
      job_name: 'Alpha',
      customer: 'Hospital A',
      active: 1,
      last_calibrated: '2025-08-21',
      estimated_days: 5,
      num_tech: 1,
      primary_tech: 'Daniel',
    },
    Inactive: { id: 11, job_name: 'Inactive', active: 0, last_calibrated: '2025-09-01' },
    Recent: { id: 12, job_name: 'Recent', active: 1, last_calibrated: '2026-05-01' },
  };

  const projected = generateTentativeJobs(jobs, [], now);

  assert.equal(projected.length, 1);
  assert.equal(projected[0].start_date, '2026-08-17');
  assert.equal(projected[0].end_date, '2026-08-21');
  assert.equal(projected[0].status, 'tentative');
  assert.equal(projected[0].ghostAssignments.length, 5);
  assert.deepEqual([...new Set(projected[0].ghostAssignments.map(a => a.tech_name))], ['Daniel']);
  assert.equal(projected[0].job_info_id, 10);
  assert.equal(projected[0].source_calibration_date, '2025-08-21');
});

test('a job becomes tentative exactly six months after its last calibration', () => {
  const jobs = {
    Alpha: { id: 13, job_name: 'Alpha', active: 1, last_calibrated: '2026-02-28' },
  };

  assert.equal(generateTentativeJobs(jobs, [], new Date(2026, 7, 27, 12)).length, 0);
  assert.equal(generateTentativeJobs(jobs, [], new Date(2026, 7, 28, 12)).length, 1);
});

test('uses primary technician for one-person jobs and Unassigned otherwise', () => {
  const jobs = {
    Primary: { id: 20, job_name: 'Primary', active: 1, last_calibrated: '2025-10-06', num_tech: 1, primary_tech: 'joey', scheduled_with: 'Not Scheduled' },
    Team: { id: 22, job_name: 'Team', active: 1, last_calibrated: '2025-10-20', num_tech: 2, primary_tech: 'Daniel', scheduled_with: 'Daniel, Matt' },
    Open: { id: 21, job_name: 'Open', active: 1, last_calibrated: '2025-11-04' },
  };

  const projected = generateTentativeJobs(jobs, [], now);

  assert.equal(projected.find(job => job.title === 'Primary').ghostAssignments[0].tech_name, 'Joey');
  assert.equal(projected.find(job => job.title === 'Team').ghostAssignments[0].tech_name, 'Unassigned');
  assert.equal(projected.find(job => job.title === 'Open').ghostAssignments[0].tech_name, 'Unassigned');
});

test('suppresses a projection when a real job exists within three weeks', () => {
  const jobs = {
    Alpha: { id: 30, job_name: 'Alpha', active: 1, last_calibrated: '2025-08-21' },
  };
  const events = [{ id: 99, title: 'alpha', start_date: '2026-08-31' }];

  assert.deepEqual(generateTentativeJobs(jobs, events, now), []);
});

test('materializing a tentative job preserves the selected status and ticket', () => {
  const materialized = materializeTentativeJob({
    id: 'ghost-job-10',
    isGhost: true,
    sourceJobInfo: { id: 10 },
    ghostAssignments: [],
    title: 'Alpha',
    status: 'confirmed',
    ticket_id: 'INC-1234',
  });

  assert.equal(materialized.id, undefined);
  assert.equal(materialized.status, 'confirmed');
  assert.equal(materialized.ticket_id, 'INC-1234');
  assert.equal('isGhost' in materialized, false);
  assert.equal('sourceJobInfo' in materialized, false);
});

test('normalizes stored tentative events and assignments to estimated business days', () => {
  const jobs = {
    Skyline: { job_name: 'Skyline', estimated_days: 3, num_tech: 1, primary_tech: 'Daniel' },
  };
  const events = [{ id: 312, title: 'Skyline', status: 'tentative', start_date: '2026-09-14', end_date: '2026-09-14' }];
  const assignments = [{ event_id: 312, tech_name: 'Joey', date: '2026-09-14' }];

  const normalized = normalizeTentativeCalendar(events, assignments, jobs);

  assert.equal(normalized.events[0].end_date, '2026-09-16');
  assert.deepEqual(normalized.assignments, [
    { event_id: 312, tech_name: 'Joey', date: '2026-09-14' },
    { event_id: 312, tech_name: 'Joey', date: '2026-09-15' },
    { event_id: 312, tech_name: 'Joey', date: '2026-09-16' },
  ]);
});

test('stacks same-technician ghosts into the next open business-day slot', () => {
  const jobs = {
    Alpha: { id: 40, job_name: 'Alpha', active: 1, last_calibrated: '2025-08-18', estimated_days: 3, num_tech: 1, primary_tech: 'Daniel' },
    Beta: { id: 41, job_name: 'Beta', active: 1, last_calibrated: '2025-08-18', estimated_days: 3, num_tech: 1, primary_tech: 'Daniel' },
  };

  const projected = generateTentativeJobs(jobs, [], now);

  assert.deepEqual(projected.map(event => [event.title, event.start_date, event.end_date]), [
    ['Alpha', '2026-08-17', '2026-08-19'],
    ['Beta', '2026-08-20', '2026-08-24'],
  ]);
});

test('places ghosts around real assignments and technician time off', () => {
  const jobs = {
    Alpha: { id: 50, job_name: 'Alpha', active: 1, last_calibrated: '2025-08-18', estimated_days: 2, num_tech: 1, primary_tech: 'Daniel' },
  };
  const assignments = [{ event_id: 900, tech_name: 'Daniel', date: '2026-08-17' }];
  const techEvents = [{ tech_name: 'Daniel', date: '2026-08-18', event_type: 'pto' }];

  const projected = generateTentativeJobs(jobs, [], now, assignments, techEvents);

  assert.equal(projected[0].start_date, '2026-08-19');
  assert.equal(projected[0].end_date, '2026-08-20');
});
