(() => {
  const isTouchLayout = () =>
    window.matchMedia('(max-width: 760px)').matches
    || window.matchMedia('(hover: none)').matches
    || window.matchMedia('(pointer: coarse)').matches;

  function closeMenus(except = null) {
    document.querySelectorAll('.calibration-menu.menu-open').forEach(menu => {
      if (menu === except) return;
      menu.classList.remove('menu-open');
      const trigger = menu.querySelector('.calibration-menu-trigger');
      trigger?.setAttribute('aria-expanded', 'false');
      trigger?.blur();
    });
  }

  function setupMenus() {
    document.querySelectorAll('.calibration-menu').forEach(menu => {
      const trigger = menu.querySelector('.calibration-menu-trigger');
      if (!trigger) return;
      trigger.setAttribute('aria-expanded', 'false');

      trigger.addEventListener('click', event => {
        if (!isTouchLayout()) return;
        if (!menu.classList.contains('menu-open')) {
          event.preventDefault();
          event.stopImmediatePropagation();
          closeMenus(menu);
          menu.classList.add('menu-open');
          trigger.setAttribute('aria-expanded', 'true');
          return;
        }
        menu.classList.remove('menu-open');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.blur();
      }, true);

      menu.querySelectorAll('.calibration-menu-panel a').forEach(link => {
        link.addEventListener('click', () => closeMenus());
      });
    });

    document.addEventListener('click', event => {
      if (!event.target.closest('.calibration-menu')) closeMenus();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeMenus();
    });
    window.addEventListener('resize', () => {
      if (!isTouchLayout()) closeMenus();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupMenus);
  } else {
    setupMenus();
  }
})();
