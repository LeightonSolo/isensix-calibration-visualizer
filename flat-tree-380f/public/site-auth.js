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

  function addLoginStyles() {
    if (document.getElementById('site-auth-styles')) return;
    const style = document.createElement('style');
    style.id = 'site-auth-styles';
    style.textContent = `
      .site-auth-overlay { position: fixed; inset: 0; z-index: 100000; display: grid; place-items: center; box-sizing: border-box; padding: 20px; background: #0d0e12; color: #f7f8fb; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      .site-auth-card { width: min(100%, 360px); box-sizing: border-box; padding: 26px; border: 1px solid #30333d; border-radius: 12px; background: #17181e; box-shadow: 0 18px 50px rgba(0, 0, 0, .35); }
      .site-auth-brand { display: flex; align-items: center; gap: 8px; margin-bottom: 20px; font-size: 18px; font-weight: 700; }
      .site-auth-pulse { color: #4c94ed; }
      .site-auth-title { margin: 0 0 5px; font-size: 24px; }
      .site-auth-copy { margin: 0 0 20px; color: #a8adba; }
      .site-auth-label { display: grid; gap: 6px; margin-top: 14px; color: #d9dce5; font-size: 13px; font-weight: 600; }
      .site-auth-input { width: 100%; min-height: 44px; box-sizing: border-box; padding: 9px 11px; border: 1px solid #3b3f4b; border-radius: 7px; outline: none; background: #202229; color: #fff; font: inherit; font-size: 16px; }
      .site-auth-input:focus { border-color: #4c94ed; box-shadow: 0 0 0 3px rgba(76, 148, 237, .22); }
      .site-auth-input[readonly] { color: #a8adba; }
      .site-auth-error { min-height: 18px; margin-top: 12px; color: #ff8e8e; font-size: 13px; }
      .site-auth-submit { width: 100%; min-height: 44px; margin-top: 4px; border: 0; border-radius: 7px; background: #347ed8; color: #fff; font: inherit; font-size: 15px; font-weight: 700; cursor: pointer; }
      .site-auth-submit:hover { background: #418de7; }
      .site-auth-submit:disabled { cursor: wait; opacity: .7; }
      @media (prefers-color-scheme: light) {
        .site-auth-overlay { background: #eef1f6; color: #151821; }
        .site-auth-card { border-color: #d6dae3; background: #fff; box-shadow: 0 18px 50px rgba(32, 44, 69, .16); }
        .site-auth-copy, .site-auth-input[readonly] { color: #626b7a; }
        .site-auth-label { color: #303644; }
        .site-auth-input { border-color: #c8ced9; background: #f7f8fa; color: #151821; }
      }
    `;
    document.head.appendChild(style);
  }

  function promptForToken() {
    return new Promise(resolve => {
      addLoginStyles();
      const overlay = document.createElement('div');
      overlay.className = 'site-auth-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-labelledby', 'site-auth-title');
      overlay.innerHTML = `
        <form class="site-auth-card" autocomplete="on">
          <div class="site-auth-brand"><span class="site-auth-pulse">⌁</span> Isensix</div>
          <h1 class="site-auth-title" id="site-auth-title">Sign in</h1>
          <p class="site-auth-copy">Enter the site password to continue.</p>
          <label class="site-auth-label">Account
            <input class="site-auth-input" name="username" type="text" value="Isensix" autocomplete="username" readonly>
          </label>
          <label class="site-auth-label">Password
            <input class="site-auth-input" name="password" type="password" autocomplete="current-password" required>
          </label>
          <div class="site-auth-error" role="alert" aria-live="polite"></div>
          <button class="site-auth-submit" type="submit">Sign in</button>
        </form>
      `;

      const form = overlay.querySelector('form');
      const password = overlay.querySelector('[name="password"]');
      const error = overlay.querySelector('.site-auth-error');
      const submit = overlay.querySelector('.site-auth-submit');
      form.addEventListener('submit', async event => {
        event.preventDefault();
        const siteToken = password.value.trim();
        if (!siteToken) return;
        submit.disabled = true;
        submit.textContent = 'Signing in…';
        error.textContent = '';

        if (await validate(siteToken)) {
          sessionStorage.setItem(TOKEN_KEY, siteToken);
          overlay.remove();
          resolve(siteToken);
          return;
        }

        submit.disabled = false;
        submit.textContent = 'Sign in';
        error.textContent = 'Incorrect site password. Contact Leighton for assistance.';
        password.select();
      });

      document.body.appendChild(overlay);
      password.focus();
    });
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
