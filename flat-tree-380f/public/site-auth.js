/** Provides the shared site login and authenticated browser API headers. */
(function () {
  'use strict';

  const TOKEN_KEY = 'cal_site_token';
  let config = null;
  let readyPromise = null;

  function token() {
    return sessionStorage.getItem(TOKEN_KEY);
  }

  function headers(extra = {}) {
    const result = {
      'X-Api-Key': config.API_KEY,
    };
    const siteToken = token();
    if (siteToken) result['X-Editor-Token'] = siteToken;
    return { ...result, ...extra };
  }

  async function validate(siteToken) {
    if (!siteToken) return false;
    try {
      const response = await fetch(`${config.WORKER_URL}/auth/site`, {
        headers: {
          'X-Api-Key': config.API_KEY,
          'X-Editor-Token': siteToken,
        },
      });
      return response.ok;
    } catch (_) {
      return false;
    }
  }

  async function promptForToken() {
    for (;;) {
      const input = window.prompt('Enter the site password:');
      if (input === null) throw new Error('Site login required');
      const siteToken = input.trim();
      if (await validate(siteToken)) {
        sessionStorage.setItem(TOKEN_KEY, siteToken);
        return siteToken;
      }
      window.alert('Incorrect site password. Contact Leighton for assistance.');
    }
  }

  function init(nextConfig) {
    config = nextConfig;
    if (!readyPromise) {
      readyPromise = (async () => {
        const existing = token();
        if (existing && await validate(existing)) return existing;
        sessionStorage.removeItem(TOKEN_KEY);
        return promptForToken();
      })();
    }
    window.siteReady = readyPromise;
    return readyPromise;
  }

  function ensure() {
    if (token()) return Promise.resolve(token());
    if (!readyPromise) return init(config);
    return readyPromise.catch(() => {
      readyPromise = null;
      window.siteReady = null;
      return init(config);
    });
  }

  function lock() {
    sessionStorage.removeItem(TOKEN_KEY);
    readyPromise = null;
    window.siteReady = init(config);
  }

  window.siteAuth = { init, ensure, token, headers, lock };
  window.siteApiHeaders = headers;
})();
