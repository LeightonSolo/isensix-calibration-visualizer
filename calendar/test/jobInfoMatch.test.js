import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findJobInfoMatch,
  filterJobInfoNames,
  getJobInfoNames,
  shouldUpdateAutofilledCustomer,
} from '../src/utils/jobInfoMatch.js';

const jobInfoMap = {
  'UHHS Phase 2': { job_name: 'UHHS Phase 2', customer: 'UHHS' },
  Asuragen: { job_name: 'Asuragen', customer: 'Asuragen' },
};

test('matches a suggested job name without forcing list membership', () => {
  assert.equal(findJobInfoMatch(jobInfoMap, ' uhhs PHASE 2 ')?.customer, 'UHHS');
  assert.equal(findJobInfoMatch(jobInfoMap, 'Custom planning meeting'), null);
});

test('returns sorted autocomplete names', () => {
  assert.deepEqual(getJobInfoNames(jobInfoMap), ['Asuragen', 'UHHS Phase 2']);
});

test('filters while typing but the arrow can show every job', () => {
  const names = getJobInfoNames(jobInfoMap);
  assert.deepEqual(filterJobInfoNames(names, 'uhhs'), ['UHHS Phase 2']);
  assert.deepEqual(filterJobInfoNames(names, 'uhhs', true), names);
});

test('replaces a previous autofill but preserves a manually entered customer', () => {
  assert.equal(shouldUpdateAutofilledCustomer('', null), true);
  assert.equal(shouldUpdateAutofilledCustomer('UHHS', 'UHHS'), true);
  assert.equal(shouldUpdateAutofilledCustomer('Manually entered customer', null), false);
  assert.equal(shouldUpdateAutofilledCustomer('Existing customer', null, true), true);
});
