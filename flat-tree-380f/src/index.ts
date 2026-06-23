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
  INSERT INTO calibrations
    (sensor_id, cp_address, sensor_name, serial_number,
     old_offset, new_offset, access_point, quality,
     status, sensor_type, zone, calibrated_at,
     calibrated_by, server, cal_cert, canned_msg)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(sensor_id) DO UPDATE SET
    cp_address = COALESCE(excluded.cp_address, cp_address),
    sensor_name = COALESCE(excluded.sensor_name, sensor_name),
    serial_number = COALESCE(excluded.serial_number, serial_number),
    old_offset = COALESCE(excluded.old_offset, old_offset),
    new_offset = COALESCE(excluded.new_offset, new_offset),
    access_point = COALESCE(excluded.access_point, access_point),
    quality = COALESCE(excluded.quality, quality),
    status = COALESCE(excluded.status, status),
    sensor_type = COALESCE(excluded.sensor_type, sensor_type),
    zone = COALESCE(excluded.zone, zone),
    calibrated_at = COALESCE(excluded.calibrated_at, calibrated_at),
    calibrated_by = COALESCE(excluded.calibrated_by, calibrated_by),
    server = COALESCE(excluded.server, server),
    cal_cert = COALESCE(excluded.cal_cert, cal_cert),
    canned_msg = COALESCE(excluded.canned_msg, canned_msg),
    captured_at = datetime('now')
`).bind(
  sensor_id, cp_address ?? null, sensor_name ?? null, serial_number ?? null,
  old_offset ?? null, new_offset ?? null, access_point ?? null, quality ?? null,
  status ?? null, sensor_type ?? null, zone ?? null, calibrated_at ?? null,
  calibrated_by ?? null, server ?? null, cal_cert ?? null, canned_msg ?? null
	).run();

      return Response.json({ ok: true }, { headers: corsHeaders() });
    }

	// POST /calibrations/batch — upsert many sensors at once
if (request.method === 'POST' && pathname === '/calibrations/batch') {
  const body = await request.json() as { sensors: Record<string, any>[] };
  const { sensors } = body;

  if (!Array.isArray(sensors) || sensors.length === 0) {
    return new Response('No sensors provided', { status: 400 });
  }

  const stmt = env.DB.prepare(`
    INSERT INTO calibrations
      (sensor_id, zone, sensor_name, sensor_type, serial_number,
       calibrated_at, calibrated_by, old_offset, new_offset, cal_cert, server)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(sensor_id) DO UPDATE SET
      zone = COALESCE(excluded.zone, zone),
      sensor_name = COALESCE(excluded.sensor_name, sensor_name),
      sensor_type = COALESCE(excluded.sensor_type, sensor_type),
      serial_number = COALESCE(excluded.serial_number, serial_number),
      calibrated_at = COALESCE(excluded.calibrated_at, calibrated_at),
      calibrated_by = COALESCE(excluded.calibrated_by, calibrated_by),
      old_offset = COALESCE(excluded.old_offset, old_offset),
      new_offset = COALESCE(excluded.new_offset, new_offset),
      cal_cert = COALESCE(excluded.cal_cert, cal_cert),
      server = COALESCE(excluded.server, server),
      captured_at = datetime('now')
  `);

  await env.DB.batch(
    sensors.map(s => stmt.bind(
      s.sensor_id, s.zone ?? null, s.sensor_name ?? null, s.sensor_type ?? null,
      s.serial_number ?? null, s.calibrated_at ?? null, s.calibrated_by ?? null,
      s.old_offset ?? null, s.new_offset ?? null, s.cal_cert ?? null, s.server ?? null
    ))
  );

  return Response.json({ ok: true, count: sensors.length }, { headers: corsHeaders() });
}

    // GET /calibrations — fetch records, optionally filtered by server
    if (request.method === 'GET' && pathname === '/calibrations') {
		const server = url.searchParams.get('server');
		const since = url.searchParams.get('since'); // e.g. "2026-06-17"

		let query = `SELECT * FROM calibrations WHERE 1=1`;
		const bindings: any[] = [];

		if (server) {
			query += ` AND server = ?`;
			bindings.push(server);
		}
		if (since) {
			query += ` AND calibrated_at >= ?`;
			bindings.push(since);
		}

		query += ` ORDER BY calibrated_at DESC LIMIT 1000`;

		const { results } = await env.DB.prepare(query).bind(...bindings).all();
		return Response.json(results, { headers: corsHeaders() });
	}

    return new Response('Not found', { status: 404 });
  }
};