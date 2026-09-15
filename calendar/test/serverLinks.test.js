/** Tests that calendar server links use configured internal tunnels only. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { serverTunnelUrl } from '../src/utils/serverLinks.js';

test('uses the configured internal tunnel hostname and version port', () => {
  assert.equal(
    serverTunnelUrl('123', { 123: { hostname: 'ics3.isensix.com', version: 'G2.1' } }),
    'https://ics3.isensix.com:7123'
  );
});

test('falls back to the default internal tunnel for customer hostnames', () => {
  assert.equal(
    serverTunnelUrl('123', { 123: { hostname: 'customer.example.com', version: 'G3.0' } }),
    'https://ics1.ca.isensix.com:7123'
  );
});

test('does not link non-three-digit server values', () => {
  assert.equal(serverTunnelUrl('legacy', { legacy: { hostname: 'ics3.isensix.com' } }), null);
});
