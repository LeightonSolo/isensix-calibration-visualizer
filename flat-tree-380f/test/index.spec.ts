import { describe, expect, it, vi } from 'vitest';
import worker from '../src/index';

const baseEnv = {
  API_KEY: 'test-api-key',
  EDITOR_TOKEN: 'test-editor-token',
} as Env;

function apiRequest(path: string, init: RequestInit = {}) {
  return new Request(`https://example.com${path}`, {
    ...init,
    headers: { 'X-Api-Key': 'test-api-key', ...(init.headers || {}) },
  });
}

describe('Job Info API', () => {
  it('rejects requests without the API key', async () => {
    const response = await worker.fetch(new Request('https://example.com/jobinfo/summary'), baseEnv);
    expect(response.status).toBe(401);
  });

  it('requires editor authorization for writes before touching D1', async () => {
    const response = await worker.fetch(apiRequest('/jobinfo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_name: 'Test job' }),
    }), baseEnv);
    expect(response.status).toBe(403);
  });

  it('binds every Job Info upsert placeholder and accepts protected writes', async () => {
    let sql = '';
    let bindings: unknown[] = [];
    const run = vi.fn().mockResolvedValue({ success: true });
    const prepare = vi.fn().mockImplementation((statement: string) => {
      sql = statement;
      return { bind: (...values: unknown[]) => { bindings = values; return { run }; } };
    });
    const env = { ...baseEnv, DB: { prepare } } as unknown as Env;
    const response = await worker.fetch(apiRequest('/jobinfo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Editor-Token': 'test-editor-token' },
      body: JSON.stringify({ job_name: 'Test job', last_calibrated: '2026-08-20' }),
    }), env);

    expect(response.status).toBe(200);
    expect((sql.match(/\?/g) || []).length).toBe(bindings.length);
    expect(bindings).toContain('2026-08-20');
    expect(run).toHaveBeenCalledOnce();
  });

  it('returns projected summary rows without sensitive fields', async () => {
    const all = vi.fn().mockResolvedValue({ results: [{ id: 1, job_name: 'Alpha' }] });
    const prepare = vi.fn().mockReturnValue({ all });
    const env = { ...baseEnv, DB: { prepare } } as unknown as Env;

    const response = await worker.fetch(apiRequest('/jobinfo/summary'), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ id: 1, job_name: 'Alpha' }]);
    const sql = prepare.mock.calls[0][0] as string;
    expect(sql).toContain('last_calibrated');
    expect(sql).toContain('prev_hotel');
    expect(sql).not.toContain('credentials');
    expect(sql).not.toContain('main_contact');
  });

  it('returns analytics result sets with stable names', async () => {
    const batch = vi.fn().mockResolvedValue([
      { results: [{ total_jobs: 2, total_sensors: 10 }] },
      { results: [{ label: 'Guardian', value: 2, sensor_value: 10 }] },
      { results: [{ label: 'G3.0', value: 2, sensor_value: 10 }] },
      { results: [{ label: '2026-07', value: 2, sensor_value: 10 }] },
      { results: [{ label: '2026-07', value: 1, sensor_value: 6 }] },
      { results: [{ label: 'Leighton', value: 1, sensor_value: 6 }] },
    ]);
    const prepare = vi.fn().mockImplementation((sql: string) => ({ sql }));
    const env = { ...baseEnv, DB: { prepare, batch } } as unknown as Env;

    const response = await worker.fetch(apiRequest('/jobinfo/stats'), env);
    const body = await response.json() as Record<string, unknown>;
    expect(response.status).toBe(200);
    expect(body).toHaveProperty('overview');
    expect(body).toHaveProperty('hardware');
    expect(body).toHaveProperty('calendar_jobs_by_month');
    expect(body).toHaveProperty('calendar_jobs_by_tech');
    expect((body.hardware as Array<Record<string, number>>)[0].sensor_value).toBe(10);
    expect(batch).toHaveBeenCalledOnce();
  });
});
