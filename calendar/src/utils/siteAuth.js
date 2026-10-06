import { CONFIG } from '../config';

export const SITE_TOKEN_KEY = CONFIG.SITE_TOKEN_KEY;

export function siteToken() {
  return sessionStorage.getItem(SITE_TOKEN_KEY);
}

export function siteHeaders(extra = {}) {
  const headers = {
    'X-Api-Key': CONFIG.API_KEY,
  };
  const token = siteToken();
  if (token) headers['X-Editor-Token'] = token;
  return { ...headers, ...extra };
}

export async function validateSiteToken(token) {
  if (!token) return false;
  try {
    const response = await fetch(`${CONFIG.WORKER_URL}/auth/site`, {
      headers: {
        'X-Api-Key': CONFIG.API_KEY,
        'X-Editor-Token': token,
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function requireSiteToken(candidate) {
  const existing = siteToken();
  if (existing && await validateSiteToken(existing)) return existing;
  sessionStorage.removeItem(SITE_TOKEN_KEY);

  const token = candidate?.trim();
  if (!token) throw new Error('Site login required');
  if (await validateSiteToken(token)) {
    sessionStorage.setItem(SITE_TOKEN_KEY, token);
    return token;
  }
  throw new Error('Incorrect site password. Contact Leighton for assistance.');
}
