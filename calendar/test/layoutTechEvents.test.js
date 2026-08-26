import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTechSpans,
  horizontalLaneStyle,
  layoutTechEvents,
} from '../src/utils/layoutTechEvents.js';

test('unrelated overlaps do not shrink an isolated event', () => {
  const dayStrs = [
    '2026-05-18', '2026-05-19', '2026-05-20', '2026-05-21', '2026-05-22',
    '2026-05-25', '2026-05-26', '2026-05-27', '2026-05-28', '2026-05-29',
  ];
  const spans = [
    {
      event: { id: 1, title: 'UHHS Phase 2' },
      dates: dayStrs.slice(0, 5),
    },
    {
      event: { id: 2, title: 'Overlapping job A' },
      dates: dayStrs.slice(5, 9),
    },
    {
      event: { id: 3, title: 'Overlapping job B' },
      dates: dayStrs.slice(6, 10),
    },
  ];

  const layout = layoutTechEvents(spans, dayStrs);
  const uhhs = layout.find(span => span.event.id === 1);
  const overlapA = layout.find(span => span.event.id === 2);
  const overlapB = layout.find(span => span.event.id === 3);

  assert.equal(uhhs.lane, 0);
  assert.equal(uhhs.totalLanes, 1);
  assert.equal(overlapA.totalLanes, 2);
  assert.equal(overlapB.totalLanes, 2);
  assert.notEqual(overlapA.lane, overlapB.lane);
});

test('adjacent events stay in the full-width lane', () => {
  const dayStrs = ['2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11'];
  const layout = layoutTechEvents([
    { event: { id: 42 }, dates: dayStrs.slice(0, 2) },
    { event: { id: 374 }, dates: dayStrs.slice(2) },
  ], dayStrs);

  assert.deepEqual(layout.map(span => [span.lane, span.totalLanes]), [[0, 1], [0, 1]]);
});

test('true overlaps use horizontal lanes without changing their vertical start', () => {
  const dayStrs = ['2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11'];
  const layout = layoutTechEvents([
    { event: { id: 1 }, dates: dayStrs.slice(0, 3) },
    { event: { id: 2 }, dates: dayStrs.slice(2) },
  ], dayStrs);

  assert.deepEqual(layout.map(span => [span.lane, span.totalLanes]), [[0, 2], [1, 2]]);
  assert.deepEqual(horizontalLaneStyle(0, 2), {
    left: 'calc(0% + 1px)',
    width: 'calc(50% - 1px)',
  });
  assert.deepEqual(horizontalLaneStyle(1, 2), {
    left: 'calc(50% + 0px)',
    width: 'calc(50% - 1px)',
  });
});

test('horizontal lanes fill the cell gutter without gaps or overflow', () => {
  assert.deepEqual(horizontalLaneStyle(0, 1), {
    left: 'calc(0% + 1px)',
    width: 'calc(100% - 2px)',
  });
  assert.deepEqual(horizontalLaneStyle(0, 3), {
    left: 'calc(0% + 1px)',
    width: 'calc(33.333333% - 0.666667px)',
  });
  assert.deepEqual(horizontalLaneStyle(2, 3), {
    left: 'calc(66.666667% - 0.333333px)',
    width: 'calc(33.333333% - 0.666667px)',
  });
});

test('span building ignores out-of-range dates and separates assignment gaps', () => {
  const dayStrs = ['2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11'];
  const events = [{ id: 42, start_date: '2026-09-08', end_date: '2026-09-10' }];
  const assignments = [
    { event_id: 42, tech_name: 'Leighton', date: '2026-09-08' },
    { event_id: 42, tech_name: 'Leighton', date: '2026-09-10' },
    { event_id: 42, tech_name: 'Leighton', date: '2026-09-11' },
  ];

  assert.deepEqual(buildTechSpans(events, assignments, dayStrs).Leighton, [
    { event: events[0], dates: ['2026-09-08'] },
    { event: events[0], dates: ['2026-09-10'] },
  ]);
});
