import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBusyDatesByTech,
  estimatedBusinessEndDate,
  fillAssignedTechnicians,
  withinEventDateRange,
  withAutomaticUnassigned,
  withoutAutomaticUnassigned,
} from '../src/utils/calendarAssignments.js';

const event = {
  id: 42,
  start_date: '2026-08-24',
  end_date: '2026-08-26',
};

test('removes persisted Unassigned assignments case-insensitively', () => {
  const assignments = [
    { event_id: 42, tech_name: 'Unassigned', date: '2026-08-24' },
    { event_id: 42, tech_name: ' unassigned ', date: '2026-08-25' },
    { event_id: 42, tech_name: 'Joey', date: '2026-08-26' },
  ];

  assert.deepEqual(withoutAutomaticUnassigned(assignments), [assignments[2]]);
});

test('derives Unassigned only for event dates with no technician', () => {
  const assignments = [
    { event_id: 42, tech_name: 'Unassigned', date: '2026-08-24' },
    { event_id: 42, tech_name: 'Joey', date: '2026-08-25' },
    { event_id: 42, tech_name: 'Daniel', date: '2026-08-25' },
  ];

  assert.deepEqual(withAutomaticUnassigned([event], assignments), [
    assignments[1],
    assignments[2],
    { event_id: 42, tech_name: 'Unassigned', date: '2026-08-24', isAutomaticUnassigned: true },
    { event_id: 42, tech_name: 'Unassigned', date: '2026-08-26', isAutomaticUnassigned: true },
  ]);
});

test('limits derived Unassigned dates to the visible calendar range', () => {
  assert.deepEqual(withAutomaticUnassigned([event], [], ['2026-08-25']), [
    { event_id: 42, tech_name: 'Unassigned', date: '2026-08-25', isAutomaticUnassigned: true },
  ]);
});

test('removes technician assignments outside the edited event range', () => {
  const assignments = [
    { tech_name: 'Leighton', date: '2026-09-08' },
    { tech_name: 'Leighton', date: '2026-09-09' },
    { tech_name: 'Leighton', date: '2026-09-10' },
  ];

  assert.deepEqual(withinEventDateRange(assignments, '2026-09-08', '2026-09-09'), [
    assignments[0],
    assignments[1],
  ]);
});

test('calculates an estimated end date in business days', () => {
  assert.equal(estimatedBusinessEndDate('2026-09-11', 3), '2026-09-15');
  assert.equal(estimatedBusinessEndDate('2026-09-14', null), '2026-09-14');
});

test('fills assigned technicians across a new range except job and PTO conflicts', () => {
  const busy = buildBusyDatesByTech([
    { event_id: 10, tech_name: 'Daniel', date: '2026-09-15' },
    { event_id: 42, tech_name: 'Daniel', date: '2026-09-16' },
  ], [
    { tech_name: 'Daniel', date: '2026-09-17', event_type: 'pto' },
  ], 42);
  const filled = fillAssignedTechnicians(
    { Daniel: new Set(['2026-09-14']) },
    '2026-09-14',
    '2026-09-18',
    busy,
  );

  assert.deepEqual([...filled.Daniel], [
    '2026-09-14',
    '2026-09-16',
    '2026-09-18',
  ]);
});

test('does not reassign a technician that was manually cleared', () => {
  const filled = fillAssignedTechnicians(
    { Daniel: new Set() },
    '2026-09-14',
    '2026-09-18',
    new Map(),
  );
  assert.deepEqual([...filled.Daniel], []);
});
