import { describe, expect, it, vi } from 'vitest';
import { buildJobInfoPreview, normalizeCmsInventoryRow, normalizeSupplierName } from '../src/cms-sync';

describe('CMS inventory normalization', () => {
  it('combines Guardian and ARMS counts and derives equipment requirements', () => {
    const row = normalizeCmsInventoryRow({
      customer_id: 30,
      hostname: 'production.ca.isensix.com',
      profile: 'N',
      supplier_name: 'Supplier credentials',
      sensor_count_arms: 33,
      sensor_count_guardian: 69,
      arms_sensors: JSON.stringify([
        { type: 'DiffPress .25', count: 2 },
        { type: 'Humidity', count: 4 },
      ]),
      guardian_sensors: [
        { type: 'CO2_A_20', count: 2 },
        { type: 'Humidity', count: 14 },
        { type: 'Oxygen', count: 1 },
      ],
      guardian_version: '2.0.1',
    });

    expect(row).toMatchObject({
      customerId: '30',
      active: 1,
      sensorCount: 102,
      hardware: 'Mix',
      o2Count: 1,
      serverVersion: 'G2.0.1',
    });
    expect(row?.meters).toEqual(['RE', 'HU', 'CO2', 'DP']);
  });

  it.each([
    ['A', 1],
    ['N', 1],
    ['X', 0],
    ['', 0],
  ])('maps profile %s to active=%i', (profile, active) => {
    expect(normalizeCmsInventoryRow({ customer_id: 5, profile })?.active).toBe(active);
  });

  it('labels a server with no Guardian version and ARMS sensors as ARMS', () => {
    expect(normalizeCmsInventoryRow({
      customer_id: 120,
      profile: 'A',
      sensor_count_arms: 20,
      sensor_count_guardian: 0,
      guardian_version: '',
    })).toMatchObject({ hardware: 'ARMS', serverVersion: 'ARMS' });
  });

  it.each([
    ['IntelliCentrics (Reptrax)', 'IntelliCentrics'],
    ['Symplr (VCS)', 'Symplr'],
    ['Green Security LLC', 'Green Security'],
    ['Vendormate', 'Vendormate'],
    ['Another Supplier', 'Another Supplier'],
  ])('normalizes supplier %s to %s', (supplier, expected) => {
    expect(normalizeSupplierName(supplier)).toBe(expected);
  });

  it('previews exact job_info changes without writing to D1', async () => {
    const all = vi.fn()
      .mockResolvedValueOnce({ results: [{ server: '30', customer: 'CA Production' }] })
      .mockResolvedValueOnce({ results: [{
        job_name: 'CA Production', servers: '30', sensors: 90, meters: 'RE', o2: 0,
        server_version: '2.0', hardware: 'Guardian', credentials: null, active: 1,
      }] });
    const prepare = vi.fn().mockReturnValue({ all });
    const db = { prepare } as unknown as D1Database;
    const normalized = normalizeCmsInventoryRow({
      customer_id: 30,
      profile: 'N',
      supplier_name: 'Supplier credentials',
      sensor_count_arms: 33,
      sensor_count_guardian: 69,
      guardian_sensors: [{ type: 'Oxygen', count: 1 }],
      guardian_version: '2.0.1',
    });

    const preview = await buildJobInfoPreview(db, [normalized!]);

    expect(preview).toMatchObject({
      serversReceived: 1,
      mappedServers: 1,
      unmatchedServers: [],
      jobs: [{
        exists_in_job_info: true,
        source_profiles: ['N'],
        credentials_action: 'fill-from-cms',
        proposed: {
          job_name: 'CA Production',
          sensors: 102,
          o2: 1,
          hardware: 'Mix',
          credentials: 'Supplier credentials',
          active: 1,
        },
      }],
    });
    expect(preview.jobs[0].changed_fields).toContain('sensors');
    expect(prepare).toHaveBeenCalledTimes(2);
  });

  it('preserves existing job_info credentials in the preview decision', async () => {
    const all = vi.fn()
      .mockResolvedValueOnce({ results: [{ server: '30', customer: 'CA Production' }] })
      .mockResolvedValueOnce({ results: [{
        job_name: 'CA Production', servers: '30', sensors: 102, meters: 'RE', o2: 0,
        server_version: 'G2.0.1', hardware: 'Mix', credentials: 'Newer job info value', active: 1,
      }] });
    const db = { prepare: vi.fn().mockReturnValue({ all }) } as unknown as D1Database;
    const row = normalizeCmsInventoryRow({
      customer_id: 30,
      profile: 'N',
      supplier_name: 'Symplr (VCS)',
      sensor_count_arms: 33,
      sensor_count_guardian: 69,
      guardian_version: '2.0.1',
    });

    const preview = await buildJobInfoPreview(db, [row!]);

    expect(preview.jobs[0].credentials_action).toBe('preserve-existing');
    expect(preview.jobs[0].changed_fields).not.toContain('credentials');
    expect(preview.jobs[0].current?.credentials).toBe('[redacted]');
    expect(preview.jobs[0].proposed.credentials).toBe('Symplr');
  });
});
