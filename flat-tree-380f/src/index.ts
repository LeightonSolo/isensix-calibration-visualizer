export interface Env {
  DB: D1Database;
  API_KEY: string;
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Api-Key',
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    const authKey = request.headers.get('X-Api-Key');
    if (authKey !== env.API_KEY) {
      return new Response('Unauthorized', { status: 401 });
    }

    // POST /calibration — insert a record
    if (request.method === 'POST' && pathname === '/calibration') {
      const body = await request.json() as Record<string, any>;

      const {
        sensor_id, cp_address, sensor_name, serial_number,
        old_offset, new_offset, access_point, quality,
        status, sensor_type, zone, calibrated_at,
        calibrated_by, server, cal_cert, canned_msg
      } = body;

      if (!sensor_id || !calibrated_at) {
        return new Response('Missing sensor_id or calibrated_at', { status: 400 });
      }

      await env.DB.prepare(`
        INSERT OR IGNORE INTO calibrations
          (sensor_id, cp_address, sensor_name, serial_number,
           old_offset, new_offset, access_point, quality,
           status, sensor_type, zone, calibrated_at,
           calibrated_by, server, cal_cert, canned_msg)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        sensor_id, cp_address ?? null, sensor_name ?? null, serial_number ?? null,
        old_offset ?? null, new_offset ?? null, access_point ?? null, quality ?? null,
        status ?? null, sensor_type ?? null, zone ?? null, calibrated_at,
        calibrated_by ?? null, server ?? null, cal_cert ?? null, canned_msg ?? null
      ).run();

      return Response.json({ ok: true }, { headers: corsHeaders() });
    }

    // GET /calibrations — fetch records, optionally filtered by server
    if (request.method === 'GET' && pathname === '/calibrations') {
      const server = url.searchParams.get('server');
      const limit = parseInt(url.searchParams.get('limit') ?? '500');

      const query = server
        ? `SELECT * FROM calibrations WHERE server = ? ORDER BY calibrated_at DESC LIMIT ?`
        : `SELECT * FROM calibrations ORDER BY calibrated_at DESC LIMIT ?`;

      const { results } = server
        ? await env.DB.prepare(query).bind(server, limit).all()
        : await env.DB.prepare(query).bind(limit).all();

      return Response.json(results, { headers: corsHeaders() });
    }

    return new Response('Not found', { status: 404 });
  }
};