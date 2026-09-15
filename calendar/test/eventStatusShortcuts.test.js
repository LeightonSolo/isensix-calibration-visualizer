/** Tests keyboard status shortcuts for hovered calendar events. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { statusForShortcut } from '../src/utils/eventStatusShortcuts.js';

test('maps B and C to booked and confirmed', () => {
  const event = { status: 'ticketed' };
  assert.equal(statusForShortcut(event, 'b'), 'booked');
  assert.equal(statusForShortcut(event, 'C'), 'confirmed');
});

test('maps T based on whether the event has a ticket', () => {
  assert.equal(statusForShortcut({ ticket_id: '12345' }, 't'), 'ticketed');
  assert.equal(statusForShortcut({ ticket_id: '  ' }, 't'), 'tentative');
  assert.equal(statusForShortcut({ ticket_id: null }, 't'), 'tentative');
});

test('ignores unsupported shortcuts and projected ghost events', () => {
  assert.equal(statusForShortcut({ ticket_id: '12345' }, 'x'), null);
  assert.equal(statusForShortcut({ isGhost: true, ticket_id: '12345' }, 'b'), null);
});
