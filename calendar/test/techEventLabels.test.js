/** Tests readable calendar labels for technician event types. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { techEventLabel } from '../src/utils/techEventLabels.js';

test('uses full labels for PTO-style events', () => {
  assert.equal(techEventLabel('holiday'), 'Holiday');
  assert.equal(techEventLabel('office'), 'Office');
  assert.equal(techEventLabel('jury_duty'), 'Jury Duty');
});

test('handles case differences and unknown event types', () => {
  assert.equal(techEventLabel('Software'), 'Software');
  assert.equal(techEventLabel('training_day'), 'training day');
});
