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

async function validate(token) {
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

export async function requireSiteToken() {
  const existing = siteToken();
  if (existing && await validate(existing)) return existing;
  sessionStorage.removeItem(SITE_TOKEN_KEY);

  for (;;) {
    const input = window.prompt('Enter the site password:');
    if (input === null) throw new Error('Site login required');
    const token = input.trim();
    if (await validate(token)) {
      sessionStorage.setItem(SITE_TOKEN_KEY, token);
      return token;
    }
    window.alert('Incorrect site password. Contact Leighton for assistance.');
  }
}
