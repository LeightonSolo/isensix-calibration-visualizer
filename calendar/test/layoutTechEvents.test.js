import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutTechEvents } from '../src/utils/layoutTechEvents.js';

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
