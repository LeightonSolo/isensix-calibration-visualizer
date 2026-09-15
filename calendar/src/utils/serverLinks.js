/** Builds safe internal tunnel links for calibration server IDs. */

const DEFAULT_TUNNEL_HOSTNAME = 'ics1.ca.isensix.com';
const TUNNEL_HOSTNAMES = new Set([DEFAULT_TUNNEL_HOSTNAME, 'ics3.isensix.com']);

const VERSION_PORTS = {
  '3.0': server => `7${server}`,
  '2.1': server => `7${server}`,
  '2.0': server => `7${server}`,
  ARMS: server => `7${server}`,
};

function normalizeHostname(hostname) {
  return String(hostname || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .split(/[/:?#]/)[0];
}

function tunnelHostname(hostname) {
  const normalized = normalizeHostname(hostname);
  return TUNNEL_HOSTNAMES.has(normalized) ? normalized : DEFAULT_TUNNEL_HOSTNAME;
}

function normalizeServerVersion(version) {
  const normalized = String(version || '3.0').trim().toUpperCase();
  if (normalized === 'ARMS') return 'ARMS';
  if (/^G?3(?:\.|$)/.test(normalized)) return '3.0';
  if (/^G?2\.1(?:\.|$)/.test(normalized)) return '2.1';
  if (/^G?2(?:\.0)?(?:\.|$)/.test(normalized)) return '2.0';
  return '3.0';
}

export function serverTunnelUrl(server, serverMeta = {}) {
  const serverId = String(server || '').trim();
  if (!/^\d{3}$/.test(serverId)) return null;

  const meta = serverMeta[serverId] || {};
  const portForVersion = VERSION_PORTS[normalizeServerVersion(meta.version)];
  return portForVersion
    ? `https://${tunnelHostname(meta.hostname)}:${portForVersion(serverId)}`
    : null;
}
