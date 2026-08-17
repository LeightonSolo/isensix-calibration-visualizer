(function () {
  'use strict';

  const STORAGE_KEY = 'isensix_theme';

  function getTheme() {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark';
    } catch (_) {
      return 'dark';
    }
  }

  function updateButtons(theme) {
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      const nextTheme = theme === 'dark' ? 'light' : 'dark';
      button.textContent = nextTheme === 'light' ? '\u2600 Light mode' : '\u263e Dark mode';
      button.setAttribute('aria-label', `Switch to ${nextTheme} mode`);
      button.setAttribute('aria-pressed', String(theme === 'light'));
      button.title = `Switch to ${nextTheme} mode`;
    });
  }

  function applyTheme(theme) {
    const normalized = theme === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = normalized;
    document.documentElement.style.colorScheme = normalized;
    updateButtons(normalized);
    window.dispatchEvent(new CustomEvent('isensix:themechange', {
      detail: { theme: normalized },
    }));
  }

  function setTheme(theme) {
    const normalized = theme === 'light' ? 'light' : 'dark';
    try {
      localStorage.setItem(STORAGE_KEY, normalized);
    } catch (_) {
      // The selected theme still applies for this page if storage is unavailable.
    }
    applyTheme(normalized);
  }

  window.IsensixTheme = {
    get: getTheme,
    set: setTheme,
    toggle() {
      setTheme(getTheme() === 'dark' ? 'light' : 'dark');
    },
  };

  applyTheme(getTheme());

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => updateButtons(getTheme()));
  } else {
    updateButtons(getTheme());
  }

  window.addEventListener('storage', event => {
    if (event.key === STORAGE_KEY) applyTheme(getTheme());
  });
})();
