/** Tests the offline calendar export row shape and ordering. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCalendarExportRows } from '../src/utils/calendarExport.js';

test('includes scheduled jobs and unavailable time in date order', () => {
  const rows = buildCalendarExportRows({
    events: [{
      id: 2, start_date: '2027-01-03', end_date: '2027-01-04',
      event_type: 'install', status: 'booked', title: 'Install A',
    }, {
      id: 1, start_date: '2027-01-02', end_date: '2027-01-02',
      event_type: 'calibration', status: 'tentative', title: 'Calibration A',
    }],
    assignments: [{ event_id: 2, tech_name: 'Daniel' }],
    techEvents: [{ date: '2027-01-01', tech_name: 'Leighton', event_type: 'pto' }],
  });

  assert.deepEqual(rows.map(row => row.record_type), [
    'Unavailable time', 'Scheduled job', 'Scheduled job',
  ]);
  assert.equal(rows[2].technician, 'Daniel');
  assert.equal(rows[2].status, 'booked');
});
