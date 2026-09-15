/** Tests calibration due and overdue follow-up derivation. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCalibrationFollowUpRows } from '../src/utils/calibrationFollowUp.js';

const now = new Date(2026, 8, 15);

test('includes overdue active jobs without a scheduled event', () => {
  const rows = buildCalibrationFollowUpRows({
    Moab: { id: 1, job_name: 'Moab Regional Hospital', active: 1, last_calibrated: '2025-07-10' },
  }, [], now);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].follow_up_status, 'overdue');
  assert.equal(rows[0].due_date, '2026-07-10');
  assert.equal(rows[0].days_overdue, 67);
});

test('excludes jobs with a future ticketed, confirmed, or booked event', () => {
  const job = { id: 2, job_name: 'Scheduled', active: 1, last_calibrated: '2025-07-10' };
  const event = {
    id: 22, job_info_id: 2, title: 'Scheduled', event_type: 'calibration',
    status: 'confirmed', start_date: '2026-10-01', end_date: '2026-10-02',
  };
  assert.equal(buildCalibrationFollowUpRows({ Scheduled: job }, [event], now).length, 0);
});

test('marks a future tentative event as needing confirmation', () => {
  const job = { id: 3, job_name: 'Tentative', active: 1, last_calibrated: '2025-10-01' };
  const event = {
    id: 33, job_info_id: 3, title: 'Tentative', event_type: 'calibration',
    status: 'tentative', start_date: '2026-09-20', end_date: '2026-09-20',
  };
  const rows = buildCalibrationFollowUpRows({ Tentative: job }, [event], now);
  assert.equal(rows[0].follow_up_status, 'needs confirmation');
  assert.equal(rows[0].next_event_date, '2026-09-20');
});
