import { describe, expect, it, vi } from 'vitest';
import worker from '../src/index';

const baseEnv = {
  API_KEY: 'test-api-key',
  EDITOR_TOKEN: 'test-editor-token',
  CALENDAR_EDITOR_TOKEN: 'test-calendar-token',
} as Env;

function apiRequest(path: string, init: RequestInit = {}) {
  return new Request(`https://example.com${path}`, {
    ...init,
    headers: {
      'X-Api-Key': 'test-api-key',
      'X-Editor-Token': 'test-editor-token',
      ...(init.headers || {}),
    },
  });
}

function createMockDb(eventAvailable = true) {
  const statements: Array<{ sql: string; bindings: unknown[] }> = [];
  const prepare = vi.fn((sql: string) => {
    const captured = { sql, bindings: [] as unknown[] };
    statements.push(captured);
    const statement: any = {
      run: vi.fn().mockResolvedValue({ success: true }),
      first: vi.fn().mockResolvedValue(eventAvailable ? { id: 42 } : null),
      all: vi.fn().mockResolvedValue({
        results: sql.includes('event_assignments')
          ? [{ technician: 'alex' }]
          : [],
      }),
      bind: vi.fn((...bindings: unknown[]) => {
        captured.bindings = bindings;
        return statement;
      }),
    };
    return statement;
  });
  const batch = vi.fn().mockResolvedValue([]);
  return { db: { prepare, batch }, statements, batch };
}

describe('Calendar travel API', () => {
  it('loads event travel for non-excluded calendar types, including upgrades', async () => {
    const { db, statements } = createMockDb();
    const response = await worker.fetch(
      apiRequest('/calendar/travel?event_id=42'),
      { ...baseEnv, DB: db } as unknown as Env,
    );

    expect(response.status).toBe(200);
    expect(statements.some(statement =>
      statement.sql.includes('FROM calendar_event_travel_items')
      && statement.sql.includes("NOT IN ('pto', 'holiday', 'office')")
      && statement.bindings[0] === 42
    )).toBe(true);
  });

  it('saves travel for any eligible event type and auto-books when all sections are complete', async () => {
    const { db, statements, batch } = createMockDb();
    const response = await worker.fetch(apiRequest('/calendar/travel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_id: 42,
        items: [
          { kind: 'hotel', technician: '', status: 'booked' },
          { kind: 'flight', technician: 'Alex', status: 'not_needed' },
          { kind: 'car', technician: 'Alex', status: 'booked' },
        ],
      }),
    }), { ...baseEnv, DB: db } as unknown as Env);
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.auto_booked_event_id).toBe(42);
    expect(batch).toHaveBeenCalledOnce();
    expect(statements.some(statement =>
      statement.sql.includes('UPDATE calendar_events')
      && statement.sql.includes("NOT IN ('pto', 'holiday', 'office')")
      && statement.bindings[0] === 42
    )).toBe(true);
  });

  it('rejects event-scoped travel for excluded event types', async () => {
    const { db } = createMockDb(false);
    const response = await worker.fetch(apiRequest('/calendar/travel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_id: 42,
        items: [],
      }),
    }), { ...baseEnv, DB: db } as unknown as Env);

    expect(response.status).toBe(404);
  });
});
