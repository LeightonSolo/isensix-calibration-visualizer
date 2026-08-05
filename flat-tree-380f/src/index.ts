export interface Env {
  DB: D1Database;
  API_KEY: string;
  EDITOR_TOKEN: string;
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE',
    'Access-Control-Allow-Headers': 'Content-Type, X-Api-Key, X-Editor-Token',
  };
}

function normalizeMinute(dt: string | null | undefined) {
  if (!dt) return null;

  return dt
    .trim()
    .replace('T', ' ')
    .replace('Z', '')
    .slice(0, 16);
}

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: corsHeaders() });
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

    // GET /servers
    if (request.method === 'GET' && pathname === '/servers') {
      const { results } = await env.DB.prepare(
        `SELECT * FROM servers ORDER BY server`
      ).all();
      return json(results);
    }

    // POST /servers — upsert a server record
    if (request.method === 'POST' && pathname === '/servers') {
      const body = await request.json() as Record<string, any>;
      const { server, version, hostname, notes, customer } = body;
      if (!server || !version) {
        return new Response('Missing server or version', { status: 400 });
      }
      await env.DB.prepare(`
        INSERT INTO servers (server, version, hostname, notes, customer)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(server) DO UPDATE SET
          version    = excluded.version,
          hostname   = excluded.hostname,
          notes      = excluded.notes,
          customer   = excluded.customer,
          updated_at = datetime('now')
      `).bind(server, version, hostname ?? null, notes ?? null, customer ?? null).run();
      return json({ ok: true });
    }

    // DELETE /servers/:id
    if (request.method === 'DELETE' && pathname.startsWith('/servers/')) {
      const server = pathname.split('/').pop();
      await env.DB.prepare(`DELETE FROM servers WHERE server = ?`).bind(server).run();
      return json({ ok: true });
    }

    // GET /exceptions — fetch all exceptions, optionally filtered by server
    if (request.method === 'GET' && pathname === '/exceptions') {
      const server = url.searchParams.get('server');
      let query = `SELECT * FROM exceptions WHERE 1=1`;
      const bindings: any[] = [];
      if (server) { query += ` AND server = ?`; bindings.push(server); }
      query += ` ORDER BY added_at DESC`;
      const { results } = await env.DB.prepare(query).bind(...bindings).all();
      return json(results);
    }

    // POST /exceptions — add an exception
    if (request.method === 'POST' && pathname === '/exceptions') {
      const body = await request.json() as Record<string, any>;
      const { sensor_id, server, sensor_name, zone, reason, year, added_by } = body;
      if (!sensor_id || !server || !reason || !year) {
        return new Response('Missing required fields', { status: 400 });
      }
      await env.DB.prepare(`
        INSERT INTO exceptions (sensor_id, server, sensor_name, zone, reason, year, added_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(sensor_id, server, year) DO UPDATE SET
          reason     = excluded.reason,
          added_by   = excluded.added_by,
          sensor_name= excluded.sensor_name,
          zone       = excluded.zone,
          added_at   = datetime('now')
      `).bind(
        sensor_id, server, sensor_name ?? null, zone ?? null,
        reason, year, added_by ?? null
      ).run();
      return json({ ok: true });
    }

    // DELETE /exceptions/:id
    if (request.method === 'DELETE' && pathname.startsWith('/exceptions/')) {
      const id = pathname.split('/').pop();
      await env.DB.prepare(`DELETE FROM exceptions WHERE id = ?`).bind(id).run();
      return json({ ok: true });
    }

    
    // ── POST /calibration — single record (calsensor confirmation) ──────────
    if (request.method === 'POST' && pathname === '/calibration') {
      const body = await request.json() as Record<string, any>;
      const {
        sensor_id, cp_address, sensor_name, serial_number,
        old_offset, new_offset, access_point, quality,
        status, sensor_type, zone, calibrated_at,
        calibrated_by, server, cal_cert, canned_msg,
      } = body;
      const normalizedCalibratedAt = normalizeMinute(calibrated_at);

      if (!sensor_id || !normalizedCalibratedAt) {
        return new Response('Missing sensor_id or calibrated_at', { status: 400 });
      }

      await env.DB.prepare(`
        INSERT INTO calibrations
          (sensor_id, cp_address, sensor_name, serial_number,
          old_offset, new_offset, access_point, quality,
          status, sensor_type, zone, calibrated_at,
          calibrated_by, server, cal_cert, canned_msg)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(sensor_id, server) DO UPDATE SET
          cp_address    = COALESCE(excluded.cp_address, cp_address),
          sensor_name   = COALESCE(excluded.sensor_name, sensor_name),
          serial_number = COALESCE(excluded.serial_number, serial_number),
          old_offset    = COALESCE(excluded.old_offset, old_offset),
          new_offset    = COALESCE(excluded.new_offset, new_offset),
          access_point  = COALESCE(excluded.access_point, access_point),
          quality       = COALESCE(excluded.quality, quality),
          status        = COALESCE(excluded.status, status),
          sensor_type   = COALESCE(excluded.sensor_type, sensor_type),
          zone          = COALESCE(excluded.zone, zone),
          cal_cert      = COALESCE(excluded.cal_cert, cal_cert),
          canned_msg    = COALESCE(excluded.canned_msg, canned_msg),
          server        = COALESCE(excluded.server, server),
          calibrated_by = excluded.calibrated_by,
          calibrated_at = excluded.calibrated_at,
          captured_at   = datetime('now')
`).bind(
        sensor_id,
        cp_address    ?? null, sensor_name  ?? null, serial_number ?? null,
        old_offset    ?? null, new_offset   ?? null, access_point  ?? null,
        quality       ?? null, status       ?? null, sensor_type   ?? null,
        zone          ?? null, normalizedCalibratedAt,
        calibrated_by ?? null, server       ?? null, cal_cert      ?? null,
        canned_msg    ?? null,
      ).run();

      return json({ ok: true });
    }

    // ── POST /calibrations/batch — bulk upsert (calreport / iserep1) ────────
    if (request.method === 'POST' && pathname === '/calibrations/batch') {
      const body = await request.json() as { sensors: Record<string, any>[] };
      const { sensors } = body;

      if (!Array.isArray(sensors) || sensors.length === 0) {
        return new Response('No sensors provided', { status: 400 });
      }

      const stmt = env.DB.prepare(`
        INSERT INTO calibrations
          (sensor_id, cp_address, sensor_name, serial_number,
          old_offset, new_offset, access_point, quality,
          status, sensor_type, zone, calibrated_at,
          calibrated_by, cal_cert, server)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(sensor_id, server) DO UPDATE SET
          cp_address    = COALESCE(excluded.cp_address, cp_address),
          sensor_name   = COALESCE(excluded.sensor_name, sensor_name),
          serial_number = COALESCE(excluded.serial_number, serial_number),
          old_offset    = COALESCE(excluded.old_offset, old_offset),
          new_offset    = COALESCE(excluded.new_offset, new_offset),
          access_point  = COALESCE(excluded.access_point, access_point),
          quality       = COALESCE(excluded.quality, quality),
          status        = COALESCE(excluded.status, status),
          sensor_type   = COALESCE(excluded.sensor_type, sensor_type),
          zone          = COALESCE(excluded.zone, zone),
          calibrated_at = CASE
            WHEN excluded.calibrated_at IS NOT NULL
            AND excluded.calibrated_at >= COALESCE(calibrated_at, '')
            THEN excluded.calibrated_at
            ELSE calibrated_at
          END,
          calibrated_by = CASE
            WHEN excluded.calibrated_at IS NOT NULL
            AND excluded.calibrated_at >= COALESCE(calibrated_at, '')
            THEN COALESCE(excluded.calibrated_by, calibrated_by)
            ELSE calibrated_by
          END,
          cal_cert = CASE
            WHEN excluded.calibrated_at IS NOT NULL
            AND excluded.calibrated_at >= COALESCE(calibrated_at, '')
            THEN COALESCE(excluded.cal_cert, cal_cert)
            ELSE cal_cert
          END,
          server        = COALESCE(excluded.server, server),
          captured_at   = datetime('now')
      `);

    await env.DB.batch(
      sensors.map(s => stmt.bind(
        s.sensor_id,
        s.cp_address    ?? null, s.sensor_name   ?? null, s.serial_number ?? null,
        s.old_offset    ?? null, s.new_offset    ?? null, s.access_point  ?? null,
        s.quality       ?? null, s.status        ?? null, s.sensor_type   ?? null,
        s.zone          ?? null, normalizeMinute(s.calibrated_at), s.calibrated_by ?? null,
        s.cal_cert      ?? null, s.server        ?? null,
      ))
    );

      return json({ ok: true, count: sensors.length });
    }

    // ── GET /calibrations — fetch records ────────────────────────────────────
    if (request.method === 'GET' && pathname === '/calibrations') {
      const server = url.searchParams.get('server');
      const since  = url.searchParams.get('since');
      const limit  = parseInt(url.searchParams.get('limit') ?? '1000');

      let query = `SELECT * FROM calibrations WHERE 1=1`;
      const bindings: any[] = [];

      if (server) { query += ` AND server = ?`;        bindings.push(server); }
      if (since)  { query += ` AND calibrated_at >= ?`; bindings.push(since); }

      query += ` ORDER BY calibrated_at DESC LIMIT ?`;
      bindings.push(limit);

      const { results } = await env.DB.prepare(query).bind(...bindings).all();
      return json(results);
    }

    // GET /jobinfo/all
    if (request.method === 'GET' && pathname === '/jobinfo/all') {
      const { results } = await env.DB.prepare(
        `SELECT * FROM job_info ORDER BY job_name`
      ).all();
      return json(results);
    }

    // GET /jobinfo/:job_name
    if (request.method === 'GET' && pathname.startsWith('/jobinfo/')) {
      const job_name = decodeURIComponent(pathname.split('/').pop() || '');
      if (!job_name) return new Response('Missing job name', { status: 400 });
      const result = await env.DB.prepare(
        `SELECT * FROM job_info WHERE job_name = ?`
      ).bind(job_name).first();
      return json(result || {});
    }

    // POST /jobinfo — upsert job info for a customer
    if (request.method === 'POST' && pathname === '/jobinfo') {
      const body = await request.json() as Record<string, any>;
      const { job_name } = body;

      if (!job_name) {
        return new Response('Missing job name', { status: 400 });
      }

      await env.DB.prepare(`
        INSERT INTO job_info (
          customer,
          job_name,
          servers,
          sensors,
          meters,
          o2,
          server_version,
          hardware,
          report,
          num_tech,
          site_address,
          offsites,
          comments,
          vpn_works,
          airport_info,
          emerald_aisle,
          prev_hotel,
          hotel_comments,
          main_contact,
          other_contacts,
          contact_notes,
          credentials,
          primary_tech,
          restaurants,
          other_notes,
          active,
          scheduled_date,
          scheduled_with
        )
        VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(job_name) DO UPDATE SET
          customer         = excluded.customer,
          job_name         = excluded.job_name,
          servers          = excluded.servers,
          sensors          = excluded.sensors,
          meters           = excluded.meters,
          o2               = excluded.o2,
          server_version   = excluded.server_version,
          hardware         = excluded.hardware,
          report           = excluded.report,
          num_tech         = excluded.num_tech,
          site_address     = excluded.site_address,
          offsites         = excluded.offsites,
          comments         = excluded.comments,
          vpn_works        = excluded.vpn_works,
          airport_info     = excluded.airport_info,
          emerald_aisle    = excluded.emerald_aisle,
          prev_hotel       = excluded.prev_hotel,
          hotel_comments   = excluded.hotel_comments,
          main_contact     = excluded.main_contact,
          other_contacts   = excluded.other_contacts,
          contact_notes    = excluded.contact_notes,
          credentials      = excluded.credentials,
          primary_tech     = excluded.primary_tech,
          restaurants      = excluded.restaurants,
          other_notes      = excluded.other_notes,
          active           = excluded.active,
          scheduled_date   = excluded.scheduled_date,
          scheduled_with   = excluded.scheduled_with,
          updated_at       = datetime('now')
      `).bind(
        body.customer ?? null,
        body.job_name ?? null,
        body.servers ?? null,
        body.sensors ?? null,
        body.meters ?? null,
        body.o2 ?? null,
        body.server_version ?? null,
        body.hardware ?? null,
        body.report ?? null,
        body.num_tech ?? null,
        body.site_address ?? null,
        body.offsites ?? null,
        body.comments ?? null,
        body.vpn_works ?? null,
        body.airport_info ?? null,
        body.emerald_aisle ?? null,
        body.prev_hotel ?? null,
        body.hotel_comments ?? null,
        body.main_contact ?? null,
        body.other_contacts ?? null,
        body.contact_notes ?? null,
        body.credentials ?? null,
        body.primary_tech ?? null,
        body.restaurants ?? null,
        body.other_notes ?? null,
        body.active ?? 1,
        body.scheduled_date ?? null,
        body.scheduled_with ?? null
      ).run();

      return json({ ok: true });

    }


    // ── Calendar events ──────────────────────────────────────

    // GET /calendar/events?start=YYYY-MM-DD&end=YYYY-MM-DD
    if (request.method === 'GET' && pathname === '/calendar/events') {
      const start = url.searchParams.get('start');
      const end   = url.searchParams.get('end');
      let q = `SELECT * FROM calendar_events WHERE 1=1`;
      const b: any[] = [];
      if (start) { q += ` AND end_date >= ?`;   b.push(start); }
      if (end)   { q += ` AND start_date <= ?`; b.push(end); }
      q += ` ORDER BY start_date ASC`;
      const { results } = await env.DB.prepare(q).bind(...b).all();
      return json(results);
    }

    // GET /calendar/assignments?start=YYYY-MM-DD&end=YYYY-MM-DD
    if (request.method === 'GET' && pathname === '/calendar/assignments') {
      const start = url.searchParams.get('start');
      const end   = url.searchParams.get('end');
      let q = `SELECT * FROM event_assignments WHERE 1=1`;
      const b: any[] = [];
      if (start) { q += ` AND date >= ?`; b.push(start); }
      if (end)   { q += ` AND date <= ?`; b.push(end); }
      const { results } = await env.DB.prepare(q).bind(...b).all();
      return json(results);
    }

    // POST /calendar/events — create or update
    if (request.method === 'POST' && pathname === '/calendar/events') {
      const editorKey = request.headers.get('X-Editor-Token');
      if (editorKey !== env.EDITOR_TOKEN) {
        return new Response('Forbidden', { status: 403 });
      }
      const body = await request.json() as Record<string, any>;
      const { id, title, event_type, status, customer,
              start_date, end_date, ticket_id, notes, assignments } = body;

      let eventId = id;
      if (id) {
        await env.DB.prepare(`
          UPDATE calendar_events SET
            title=?, event_type=?, status=?, customer=?,
            start_date=?, end_date=?, ticket_id=?, notes=?,
            updated_at=datetime('now')
          WHERE id=?
        `).bind(title, event_type, status, customer ?? null,
                start_date, end_date, ticket_id ?? null,
                notes ?? null, id).run();
      } else {
        const result = await env.DB.prepare(`
          INSERT INTO calendar_events
            (title, event_type, status, customer, start_date, end_date, ticket_id, notes)
          VALUES (?,?,?,?,?,?,?,?)
        `).bind(title, event_type, status ?? 'ticketed', customer ?? null,
                start_date, end_date, ticket_id ?? null, notes ?? null).run();
        eventId = result.meta.last_row_id;
      }

      // Replace assignments
      if (Array.isArray(assignments)) {
        await env.DB.prepare(
          `DELETE FROM event_assignments WHERE event_id = ?`
        ).bind(eventId).run();
        if (assignments.length) {
          await env.DB.batch(assignments.map((a: any) =>
            env.DB.prepare(
              `INSERT OR IGNORE INTO event_assignments (event_id, tech_name, date)
              VALUES (?,?,?)`
            ).bind(eventId, a.tech_name, a.date)
          ));
        }
      }
      return json({ ok: true, id: eventId });
    }

    // DELETE /calendar/events/:id
    if (request.method === 'DELETE' && pathname.startsWith('/calendar/events/')) {
      const editorKey = request.headers.get('X-Editor-Token');
      if (editorKey !== env.EDITOR_TOKEN) {
        return new Response('Forbidden', { status: 403 });
      }
      const id = pathname.split('/').pop();
      await env.DB.prepare(`DELETE FROM calendar_events WHERE id=?`).bind(id).run();
      return json({ ok: true });
    }

    // GET /calendar/tech-events?start=YYYY-MM-DD&end=YYYY-MM-DD
    if (request.method === 'GET' && pathname === '/calendar/tech-events') {
      const start = url.searchParams.get('start');
      const end   = url.searchParams.get('end');
      let q = `SELECT * FROM tech_events WHERE 1=1`;
      const b: any[] = [];
      if (start) { q += ` AND date >= ?`; b.push(start); }
      if (end)   { q += ` AND date <= ?`; b.push(end); }
      const { results } = await env.DB.prepare(q).bind(...b).all();
      return json(results);
    }

    // POST /calendar/tech-events
    if (request.method === 'POST' && pathname === '/calendar/tech-events') {
      const editorKey = request.headers.get('X-Editor-Token');
      if (editorKey !== env.EDITOR_TOKEN) {
        return new Response('Forbidden', { status: 403 });
      }
      const body = await request.json() as Record<string, any>;
      const { tech_name, event_type, date, notes } = body;
      await env.DB.prepare(`
        INSERT INTO tech_events (tech_name, event_type, date, notes)
        VALUES (?,?,?,?)
        ON CONFLICT(tech_name, date) DO UPDATE SET
          event_type=excluded.event_type, notes=excluded.notes
      `).bind(tech_name, event_type, date, notes ?? null).run();
      return json({ ok: true });
    }

    // POST /calendar/tech-events/batch
    if (request.method === 'POST' && pathname === '/calendar/tech-events/batch') {
      const editorKey = request.headers.get('X-Editor-Token');
      if (editorKey !== env.EDITOR_TOKEN) return new Response('Forbidden', { status: 403 });
      const body = await request.json() as { entries: Record<string, any>[] };
      const { entries } = body;
      if (!Array.isArray(entries) || !entries.length) {
        return new Response('No entries', { status: 400 });
      }
      const stmt = env.DB.prepare(`
        INSERT INTO tech_events (tech_name, event_type, date, notes)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(tech_name, date) DO UPDATE SET
          event_type = excluded.event_type,
          notes      = excluded.notes
      `);
      await env.DB.batch(
        entries.map((entry: any) =>
          stmt.bind(entry.tech_name, entry.event_type, entry.date, entry.notes ?? null)
        )
      );
      return json({ ok: true, count: entries.length });
    }

    // DELETE /calendar/tech-events/:id
    if (request.method === 'DELETE' && pathname.startsWith('/calendar/tech-events/')) {
      const editorKey = request.headers.get('X-Editor-Token');
      if (editorKey !== env.EDITOR_TOKEN) {
        return new Response('Forbidden', { status: 403 });
      }
      const id = pathname.split('/').pop();
      await env.DB.prepare(`DELETE FROM tech_events WHERE id=?`).bind(id).run();
      return json({ ok: true });
    }

    return new Response('Not found', { status: 404 });
  },
};