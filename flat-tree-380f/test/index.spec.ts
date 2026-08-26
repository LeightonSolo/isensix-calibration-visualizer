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

  it('returns calendar-derived summary rows without long-form fields', async () => {
    const all = vi.fn().mockResolvedValue({ results: [{ id: 1, job_name: 'Alpha' }] });
    const prepare = vi.fn().mockReturnValue({ all });
    const env = { ...baseEnv, DB: { prepare } } as unknown as Env;

    const response = await worker.fetch(apiRequest('/jobinfo/summary'), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ id: 1, job_name: 'Alpha' }]);
    const sql = prepare.mock.calls[0][0] as string;
    expect(sql).toContain('last_calibrated');
    expect(sql).toContain('prev_hotel');
    expect(sql).toContain('e.status AS status');
    expect(sql).toContain('e.start_date AS scheduled_start_date');
    expect(sql).not.toContain('credentials');
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

describe('Calendar API', () => {
  it('does not return legacy Unassigned assignment rows', async () => {
    const all = vi.fn().mockResolvedValue({ results: [] });
    const prepare = vi.fn().mockReturnValue({ bind: () => ({ all }), all });
    const env = { ...baseEnv, DB: { prepare } } as unknown as Env;

    const response = await worker.fetch(apiRequest('/calendar/assignments'), env);

    expect(response.status).toBe(200);
    expect(prepare.mock.calls[0][0]).toContain("lower(trim(tech_name)) <> 'unassigned'");
  });

  it('strips Unassigned before replacing an event assignment list', async () => {
    const bindings: Array<{ sql: string; values: unknown[] }> = [];
    const run = vi.fn().mockResolvedValue({ success: true });
    const prepare = vi.fn().mockImplementation((sql: string) => ({
      bind: (...values: unknown[]) => {
        bindings.push({ sql, values });
        return { run };
      },
    }));
    const batch = vi.fn().mockResolvedValue([]);
    const env = { ...baseEnv, DB: { prepare, batch } } as unknown as Env;

    const response = await worker.fetch(apiRequest('/calendar/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Editor-Token': 'test-editor-token' },
      body: JSON.stringify({
        id: 42,
        title: 'Test job',
        event_type: 'calibration',
        status: 'ticketed',
        start_date: '2026-08-24',
        end_date: '2026-08-24',
        assignments: [
          { tech_name: 'Unassigned', date: '2026-08-24' },
          { tech_name: 'Joey', date: '2026-08-24' },
        ],
      }),
    }), env);

    expect(response.status).toBe(200);
    expect(batch).toHaveBeenCalledOnce();
    expect(batch.mock.calls[0][0]).toHaveLength(1);
    expect(bindings.some(binding => binding.values.includes('Unassigned'))).toBe(false);
    expect(bindings.some(binding => binding.values.includes('Joey'))).toBe(true);
  });

  it('rejects assignment dates outside the event range before touching D1', async () => {
    const prepare = vi.fn();
    const env = { ...baseEnv, DB: { prepare } } as unknown as Env;

    const response = await worker.fetch(apiRequest('/calendar/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Editor-Token': 'test-editor-token' },
      body: JSON.stringify({
        id: 42,
        title: 'Cleveland DX',
        event_type: 'calibration',
        status: 'confirmed',
        start_date: '2026-09-08',
        end_date: '2026-09-09',
        assignments: [
          { tech_name: 'Leighton', date: '2026-09-10' },
        ],
      }),
    }), env);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Assignment dates must fall within the event date range',
    });
    expect(prepare).not.toHaveBeenCalled();
  });

  it('clears autogenerated tentative notes when an event is confirmed', async () => {
    const bindings: unknown[][] = [];
    const run = vi.fn().mockResolvedValue({ meta: { changes: 1 } });
    const prepare = vi.fn().mockImplementation(() => ({
      bind: (...values: unknown[]) => {
        bindings.push(values);
        return { run };
      },
    }));
    const env = { ...baseEnv, DB: { prepare } } as unknown as Env;

    const response = await worker.fetch(apiRequest('/calendar/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Editor-Token': 'test-editor-token' },
      body: JSON.stringify({
        id: 42,
        title: 'Test job',
        event_type: 'calibration',
        status: 'confirmed',
        start_date: '2026-10-19',
        end_date: '2026-10-23',
        notes: 'Tentative \u2014 based on Oct 2025 calibration',
      }),
    }), env);

    expect(response.status).toBe(200);
    expect(bindings[0][10]).toBeNull();
  });

  it('marks an autogenerated tentative as manually dated when its range changes', async () => {
    let updateSql = '';
    let updateBindings: unknown[] = [];
    const run = vi.fn().mockResolvedValue({ meta: { changes: 1 } });
    const prepare = vi.fn().mockImplementation((sql: string) => ({
      bind: (...values: unknown[]) => {
        if (sql.includes('UPDATE calendar_events SET')) {
          updateSql = sql;
          updateBindings = values;
        }
        return { run };
      },
    }));
    const env = { ...baseEnv, DB: { prepare } } as unknown as Env;

    const response = await worker.fetch(apiRequest('/calendar/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Editor-Token': 'test-editor-token' },
      body: JSON.stringify({
        id: 42,
        job_info_id: 10,
        source_calibration_date: '2025-10-20',
        title: 'Test job',
        event_type: 'calibration',
        status: 'tentative',
        start_date: '2026-10-19',
        end_date: '2026-10-30',
      }),
    }), env);

    expect(response.status).toBe(200);
    expect(updateSql).toContain('dates_manually_set=CASE');
    expect(updateSql).toContain('start_date <> ? OR end_date <> ?');
    expect(updateBindings.slice(0, 2)).toEqual(['2026-10-19', '2026-10-30']);
  });

  it('removes an autogenerated tentative when a manual event is created for the same job', async () => {
    const statements: string[] = [];
    const prepare = vi.fn().mockImplementation((sql: string) => ({
      bind: (..._values: unknown[]) => ({
        run: vi.fn().mockImplementation(async () => {
          statements.push(sql);
          if (sql.includes('INSERT INTO calendar_events')) return { meta: { last_row_id: 500 } };
          if (sql.includes('DELETE FROM calendar_events')) return { meta: { changes: 1 } };
          return { meta: { changes: 0 } };
        }),
      }),
    }));
    const batch = vi.fn().mockResolvedValue([]);
    const env = { ...baseEnv, DB: { prepare, batch } } as unknown as Env;

    const response = await worker.fetch(apiRequest('/calendar/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Editor-Token': 'test-editor-token' },
      body: JSON.stringify({
        job_info_id: 10,
        title: 'Test job',
        event_type: 'calibration',
        status: 'ticketed',
        start_date: '2026-10-19',
        end_date: '2026-10-23',
        assignments: [],
      }),
    }), env);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, id: 500, removed_tentatives: 1 });
    expect(statements.some(sql => sql.includes('DELETE FROM event_assignments')
      && sql.includes("status = 'tentative'"))).toBe(true);
    expect(statements.some(sql => sql.includes('DELETE FROM calendar_events')
      && sql.includes('source_calibration_date IS NOT NULL'))).toBe(true);
  });
});
