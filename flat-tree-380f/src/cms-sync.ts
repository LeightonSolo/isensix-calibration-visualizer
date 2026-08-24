const CMS_BASE_URL = 'https://cms2.isensix.com:3331';

type CmsSensorSummary = {
  type?: unknown;
  count?: unknown;
};

export type CmsInventoryRow = {
  customer_id?: unknown;
  hostname?: unknown;
  profile?: unknown;
  supplier_name?: unknown;
  sensor_count_guardian?: unknown;
  sensor_count_arms?: unknown;
  guardian_sensors?: unknown;
  arms_sensors?: unknown;
  guardian_version?: unknown;
};

export type NormalizedCmsServer = {
  customerId: string;
  hostname: string | null;
  profile: string;
  active: 0 | 1;
  supplierName: string | null;
  guardianSensorCount: number;
  armsSensorCount: number;
  sensorCount: number;
  guardianSensors: CmsSensorSummary[];
  armsSensors: CmsSensorSummary[];
  meters: string[];
  o2Count: number;
  serverVersion: string | null;
  hardware: 'Guardian' | 'ARMS' | 'Mix' | null;
};

export type CmsSyncResult = {
  runId: number | null;
  serversReceived: number;
  jobsUpdated: number;
  unmatchedServers: number;
};

type ProposedJobInfo = {
  job_name: string;
  servers: string;
  sensors: number;
  meters: string;
  o2: number;
  server_version: string;
  hardware: 'Guardian' | 'ARMS' | 'Mix' | null;
  credentials: string | null;
  active: 0 | 1;
};

type CurrentJobInfo = ProposedJobInfo;
type PreviewCurrentJobInfo = Omit<CurrentJobInfo, 'credentials'> & {
  credentials: '[redacted]' | null;
};

export type CmsJobInfoPreview = {
  serversReceived: number;
  mappedServers: number;
  unmatchedServers: Array<{
    customer_id: string;
    hostname: string | null;
    profile: string;
  }>;
  jobs: Array<{
    exists_in_job_info: boolean;
    source_profiles: string[];
    credentials_action: 'preserve-existing' | 'fill-from-cms' | 'no-cms-value';
    changed_fields: string[];
    current: PreviewCurrentJobInfo | null;
    proposed: ProposedJobInfo;
  }>;
};

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function count(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

export function normalizeSupplierName(value: unknown): string | null {
  const supplier = text(value);
  if (!supplier) return null;

  const canonicalNames: Record<string, string> = {
    'intellicentrics (reptrax)': 'IntelliCentrics',
    'symplr (vcs)': 'Symplr',
    'green security llc': 'Green Security',
    'vendormate': 'Vendormate',
  };
  return canonicalNames[supplier.toLowerCase()] ?? supplier;
}

function sensorSummary(value: unknown): CmsSensorSummary[] {
  let parsed = value;
  if (typeof parsed === 'string') {
    const source = parsed.trim();
    if (!source) return [];
    try {
      parsed = JSON.parse(source);
    } catch {
      return [];
    }
  }

  return Array.isArray(parsed)
    ? parsed.filter((item): item is CmsSensorSummary => Boolean(item) && typeof item === 'object')
    : [];
}

export function normalizeCmsInventoryRow(row: CmsInventoryRow): NormalizedCmsServer | null {
  const rawCustomerId = row.customer_id;
  const customerId = typeof rawCustomerId === 'number' || typeof rawCustomerId === 'string'
    ? String(rawCustomerId).trim()
    : '';
  if (!customerId) return null;

  const guardianSensors = sensorSummary(row.guardian_sensors);
  const armsSensors = sensorSummary(row.arms_sensors);
  const allSensorTypes = [...guardianSensors, ...armsSensors];
  const meters = new Set<string>(['RE']);
  let o2Count = 0;

  for (const sensor of allSensorTypes) {
    const type = text(sensor.type).toLowerCase();
    const sensorCount = count(sensor.count);
    if (type.includes('humidity')) meters.add('HU');
    if (type.includes('co2_a_20')) meters.add('CO2');
    if (type.includes('diffpress')) meters.add('DP');
    if (type.includes('oxygen')) o2Count += sensorCount;
  }

  const guardianSensorCount = count(row.sensor_count_guardian);
  const armsSensorCount = count(row.sensor_count_arms);
  const guardianVersion = text(row.guardian_version);
  const profile = text(row.profile).toUpperCase();
  const hardware = guardianSensorCount > 0 && armsSensorCount > 0
    ? 'Mix'
    : guardianSensorCount > 0
      ? 'Guardian'
      : armsSensorCount > 0
        ? 'ARMS'
        : null;

  return {
    customerId,
    hostname: text(row.hostname) || null,
    profile,
    active: profile === 'A' || profile === 'N' ? 1 : 0,
    supplierName: normalizeSupplierName(row.supplier_name),
    guardianSensorCount,
    armsSensorCount,
    sensorCount: guardianSensorCount + armsSensorCount,
    guardianSensors,
    armsSensors,
    meters: ['RE', 'HU', 'CO2', 'DP'].filter(meter => meters.has(meter)),
    o2Count,
    serverVersion: guardianVersion
      ? (/^g/i.test(guardianVersion) ? guardianVersion.replace(/^g/i, 'G') : `G${guardianVersion}`)
      : 'ARMS',
    hardware,
  };
}

async function cmsInventory(apiKey: string): Promise<CmsInventoryRow[]> {
  const tokenResponse = await fetch(`${CMS_BASE_URL}/v1/tokens/m2m`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!tokenResponse.ok) {
    throw new Error(`CMS token request failed with status ${tokenResponse.status}`);
  }

  const tokenBody = await tokenResponse.json() as { token?: unknown };
  const token = text(tokenBody.token);
  if (!token) throw new Error('CMS token response did not include a token');

  const inventoryResponse = await fetch(`${CMS_BASE_URL}/v1/techinfo`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(60_000),
  });
  if (!inventoryResponse.ok) {
    throw new Error(`CMS inventory request failed with status ${inventoryResponse.status}`);
  }

  const body = await inventoryResponse.json() as { inventory?: unknown };
  if (!Array.isArray(body.inventory) || body.inventory.length === 0) {
    throw new Error('CMS inventory response was empty or invalid; refusing to update D1');
  }
  return body.inventory as CmsInventoryRow[];
}

async function runBatches(db: D1Database, statements: D1PreparedStatement[], size = 50) {
  for (let index = 0; index < statements.length; index += size) {
    await db.batch(statements.slice(index, index + size));
  }
}

type CmsSyncEnv = {
  DB: D1Database;
  CMS_API_KEY: string;
};

type ServerMapping = {
  server: string;
  customer: string | null;
};

const JOB_INFO_FIELDS: Array<keyof ProposedJobInfo> = [
  'servers', 'sensors', 'meters', 'o2', 'server_version', 'hardware', 'credentials', 'active',
];

function sortedServerIds(rows: NormalizedCmsServer[]): string[] {
  return rows.map(row => row.customerId).sort((left, right) => {
    const numericDifference = Number(left) - Number(right);
    return Number.isFinite(numericDifference) && numericDifference !== 0
      ? numericDifference
      : left.localeCompare(right);
  });
}

export async function buildJobInfoPreview(db: D1Database, rows: NormalizedCmsServer[]): Promise<CmsJobInfoPreview> {
  const serverResult = await db.prepare(`
    SELECT CAST(server AS TEXT) AS server, customer FROM servers
  `).all<ServerMapping>();
  const jobResult = await db.prepare(`
    SELECT job_name, servers, sensors, meters, o2, server_version, hardware, credentials, active
    FROM job_info
  `).all<CurrentJobInfo>();

  const customerByServer = new Map(
    serverResult.results.map(row => [String(row.server).trim(), String(row.customer || '').trim()]),
  );
  const currentByJob = new Map(
    jobResult.results.map(row => [String(row.job_name).trim().toLowerCase(), row]),
  );
  const grouped = new Map<string, NormalizedCmsServer[]>();
  const unmatchedServers: CmsJobInfoPreview['unmatchedServers'] = [];

  for (const row of rows) {
    const customer = customerByServer.get(row.customerId);
    if (!customer) {
      unmatchedServers.push({
        customer_id: row.customerId,
        hostname: row.hostname,
        profile: row.profile,
      });
      continue;
    }
    const group = grouped.get(customer) ?? [];
    group.push(row);
    grouped.set(customer, group);
  }

  const jobs = [...grouped.entries()].map(([jobName, group]) => {
    const guardianCount = group.reduce((sum, row) => sum + row.guardianSensorCount, 0);
    const armsCount = group.reduce((sum, row) => sum + row.armsSensorCount, 0);
    const meterSet = new Set(group.flatMap(row => row.meters));
    const versions = [...new Set(group.map(row => row.serverVersion).filter((value): value is string => Boolean(value)))];
    const suppliers = [...new Set(group.map(row => row.supplierName).filter((value): value is string => Boolean(value)))];
    const proposed: ProposedJobInfo = {
      job_name: jobName,
      servers: sortedServerIds(group).join(', '),
      sensors: guardianCount + armsCount,
      meters: ['RE', 'HU', 'CO2', 'DP'].filter(meter => meterSet.has(meter)).join(', '),
      o2: group.reduce((sum, row) => sum + row.o2Count, 0),
      server_version: versions.join(', '),
      hardware: guardianCount > 0 && armsCount > 0 ? 'Mix' : guardianCount > 0 ? 'Guardian' : armsCount > 0 ? 'ARMS' : null,
      credentials: suppliers.length ? suppliers.join(', ') : null,
      active: group.some(row => row.active === 1) ? 1 : 0,
    };
    const current = currentByJob.get(jobName.toLowerCase()) ?? null;
    const hasExistingCredentials = Boolean(current?.credentials?.trim());
    const credentialsAction: CmsJobInfoPreview['jobs'][number]['credentials_action'] = hasExistingCredentials
      ? 'preserve-existing'
      : proposed.credentials
        ? 'fill-from-cms'
        : 'no-cms-value';
    const changedFields = current
      ? JOB_INFO_FIELDS.filter(field => {
          if (field === 'credentials') return credentialsAction === 'fill-from-cms';
          return String(current[field] ?? '') !== String(proposed[field] ?? '');
        })
      : [...JOB_INFO_FIELDS];

    return {
      exists_in_job_info: current !== null,
      source_profiles: [...new Set(group.map(row => row.profile || '(blank)'))],
      credentials_action: credentialsAction,
      changed_fields: changedFields,
      current: current ? {
        ...current,
        credentials: current.credentials ? ('[redacted]' as const) : null,
      } : null,
      proposed,
    };
  }).sort((left, right) => left.proposed.job_name.localeCompare(right.proposed.job_name));

  return {
    serversReceived: rows.length,
    mappedServers: rows.length - unmatchedServers.length,
    unmatchedServers,
    jobs,
  };
}

async function fetchNormalizedCmsInventory(apiKey: string): Promise<NormalizedCmsServer[]> {
  const rows = (await cmsInventory(apiKey))
    .map(normalizeCmsInventoryRow)
    .filter((row): row is NormalizedCmsServer => row !== null);
  if (!rows.length) throw new Error('CMS inventory contained no usable customer_id values');
  return rows;
}

export async function previewCmsSync(env: CmsSyncEnv): Promise<CmsJobInfoPreview> {
  const preview = await buildJobInfoPreview(env.DB, await fetchNormalizedCmsInventory(env.CMS_API_KEY));
  console.log('CMS sync preview summary', JSON.stringify({
    serversReceived: preview.serversReceived,
    mappedServers: preview.mappedServers,
    unmatchedServers: preview.unmatchedServers.length,
    jobs: preview.jobs.length,
    existingJobs: preview.jobs.filter(job => job.exists_in_job_info).length,
  }));
  for (const job of preview.jobs) {
    console.log('CMS job_info proposal', JSON.stringify(job));
  }
  for (const server of preview.unmatchedServers) {
    console.warn('CMS unmatched server', JSON.stringify(server));
  }
  return preview;
}

export async function syncCmsInventory(env: CmsSyncEnv): Promise<CmsSyncResult> {
  const startedAt = new Date().toISOString();
  let runId: number | null = null;

  try {
    const started = await env.DB.prepare(`
      INSERT INTO cms_sync_runs (started_at, status) VALUES (?, 'running')
    `).bind(startedAt).run();
    runId = Number(started.meta.last_row_id) || null;

    const rows = await fetchNormalizedCmsInventory(env.CMS_API_KEY);

    const inventoryStatements = rows.map(row => env.DB.prepare(`
      INSERT INTO cms_server_inventory (
        customer_id, hostname, profile, supplier_name,
        sensor_count_guardian, sensor_count_arms, sensor_count,
        guardian_sensors, arms_sensors, meters, o2,
        server_version, hardware, last_seen_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(customer_id) DO UPDATE SET
        hostname = excluded.hostname,
        profile = excluded.profile,
        supplier_name = excluded.supplier_name,
        sensor_count_guardian = excluded.sensor_count_guardian,
        sensor_count_arms = excluded.sensor_count_arms,
        sensor_count = excluded.sensor_count,
        guardian_sensors = excluded.guardian_sensors,
        arms_sensors = excluded.arms_sensors,
        meters = excluded.meters,
        o2 = excluded.o2,
        server_version = excluded.server_version,
        hardware = excluded.hardware,
        last_seen_at = excluded.last_seen_at,
        updated_at = datetime('now')
    `).bind(
      row.customerId,
      row.hostname,
      row.profile,
      row.supplierName,
      row.guardianSensorCount,
      row.armsSensorCount,
      row.sensorCount,
      JSON.stringify(row.guardianSensors),
      JSON.stringify(row.armsSensors),
      row.meters.join(', '),
      row.o2Count,
      row.serverVersion,
      row.hardware,
      startedAt,
    ));
    await runBatches(env.DB, inventoryStatements);

    const serverStatements = rows.map(row => env.DB.prepare(`
      UPDATE servers SET
        hostname = COALESCE(?, hostname),
        version = COALESCE(?, version),
        updated_at = datetime('now')
      WHERE CAST(server AS TEXT) = ?
    `).bind(row.hostname, row.serverVersion, row.customerId));
    await runBatches(env.DB, serverStatements);

    const preview = await buildJobInfoPreview(env.DB, rows);

    let jobsUpdated = 0;
    for (const job of preview.jobs) {
      const proposed = job.proposed;
      const updated = await env.DB.prepare(`
        UPDATE job_info SET
          servers = ?,
          sensors = ?,
          meters = ?,
          o2 = ?,
          server_version = ?,
          hardware = ?,
          credentials = CASE
            WHEN (credentials IS NULL OR trim(credentials) = '') AND ? <> '' THEN ?
            ELSE credentials
          END,
          active = ?,
          updated_at = datetime('now')
        WHERE lower(trim(job_name)) = lower(trim(?))
      `).bind(
        proposed.servers,
        proposed.sensors,
        proposed.meters,
        proposed.o2,
        proposed.server_version,
        proposed.hardware,
        proposed.credentials || '',
        proposed.credentials || '',
        proposed.active,
        proposed.job_name,
      ).run();
      jobsUpdated += Number(updated.meta.changes || 0);
    }

    const result = {
      runId,
      serversReceived: rows.length,
      jobsUpdated,
      unmatchedServers: preview.unmatchedServers.length,
    };
    if (runId !== null) {
      await env.DB.prepare(`
        UPDATE cms_sync_runs SET
          completed_at = ?, status = 'success', servers_received = ?,
          jobs_updated = ?, unmatched_servers = ?
        WHERE id = ?
      `).bind(new Date().toISOString(), result.serversReceived, result.jobsUpdated, result.unmatchedServers, runId).run();
    }
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (runId !== null) {
      await env.DB.prepare(`
        UPDATE cms_sync_runs SET completed_at = ?, status = 'failed', error_message = ? WHERE id = ?
      `).bind(new Date().toISOString(), message.slice(0, 1000), runId).run();
    }
    throw error;
  }
}
