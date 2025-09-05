// =====================================================
// NAV: burger toggle with fixed backdrop & modal panel
// - Works without Bootstrap
// - Locks page scroll on <html> (compatible with snap scrolling)
// =====================================================
(function initNav() {
  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  onReady(() => {
    const burger   = document.querySelector('.nav-burger');
    const panel    = document.getElementById('mobileMenu');
    const backdrop = document.querySelector('.menu-backdrop');

    // If nav is not present on this page, quietly exit
    if (!burger || !panel || !backdrop) return;

    // Open / Close helpers
    function openMenu() {
      burger.setAttribute('aria-expanded', 'true');
      panel.hidden = false;
      backdrop.hidden = false;
      panel.classList.add('active');
      backdrop.classList.add('active');
      document.body.classList.add('menu-open');
    }

    function closeMenu() {
      burger.setAttribute('aria-expanded', 'false');
      panel.classList.remove('active');
      backdrop.classList.remove('active');
      // Hide after CSS transition to avoid flicker
      setTimeout(() => {
        panel.hidden = true;
        backdrop.hidden = true;
      }, 200);
      document.body.classList.remove('menu-open');
    }

    // Toggle via button
    burger.addEventListener('click', () => {
      const expanded = burger.getAttribute('aria-expanded') === 'true';
      expanded ? closeMenu() : openMenu();
    });

    // Close on backdrop click
    backdrop.addEventListener('click', closeMenu);

    // Close when a nav link is selected
    panel.querySelectorAll('.nav-link').forEach((a) => {
      a.addEventListener('click', closeMenu);
    });

    // Optional: prevent touchmove on backdrop from scrolling the page behind
    backdrop.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  });
})();
