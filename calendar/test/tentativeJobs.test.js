import test from 'node:test';
import assert from 'node:assert/strict';
import { generateTentativeJobs, materializeTentativeJob } from '../src/utils/tentativeJobs.js';

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
    Completed: { id: 12, job_name: 'Completed', active: 1, last_calibrated: '2026-02-01' },
  };

  const projected = generateTentativeJobs(jobs, [], now);

  assert.equal(projected.length, 1);
  assert.equal(projected[0].start_date, '2026-08-17');
  assert.equal(projected[0].end_date, '2026-08-21');
  assert.equal(projected[0].status, 'tentative');
  assert.equal(projected[0].ghostAssignments.length, 5);
  assert.deepEqual([...new Set(projected[0].ghostAssignments.map(a => a.tech_name))], ['Daniel']);
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
