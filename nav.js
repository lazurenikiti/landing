// =====================================================
// NAV: burger toggle with fixed backdrop & modal panel
// - No frameworks
// - Locks page scroll while the menu is open (same pattern as fullscreen)
// - Restores exact scroll position on close
// =====================================================
(function initNav() {
  // Run callback when DOM is ready
  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  onReady(() => {
    // ----- Element refs -----
    const burger   = document.querySelector('.nav-burger');
    const panel    = document.getElementById('mobileMenu');
    const backdrop = document.querySelector('.menu-backdrop');

    // Quietly exit if nav is not present
    if (!burger || !panel || !backdrop) return;

    // Remember scroll position to restore after closing the menu
    let menuScrollY = 0;

    // ----- Open / Close -----
    function openMenu() {
      // A11y: reflect expanded state
      burger.setAttribute('aria-expanded', 'true');

      // Make panel/backdrop visible, then enable CSS transitions
      panel.hidden = false;
      backdrop.hidden = false;
      // Force reflow if you notice initial transition glitches:
      // void panel.offsetHeight;

      panel.classList.add('active');
      backdrop.classList.add('active');
      document.body.classList.add('menu-open');

      // ===== Scroll lock (mirror fullscreen behavior) =====
      // Save current scroll position
      menuScrollY = window.scrollY || document.documentElement.scrollTop || 0;

      // Disable document scrolling (CSS uses html.scroll-locked)
      document.documentElement.classList.add('scroll-locked');

      // Pin <body> so the page behind cannot move; keep layout width stable
      document.body.style.position = 'fixed';
      document.body.style.top = `-${menuScrollY}px`;
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';

      // Optional focus management: move focus into the panel for screen readers
      panel.setAttribute('tabindex', '-1');
      if (panel.focus) panel.focus({ preventScroll: true });
    }

    function closeMenu() {
      // A11y: reflect collapsed state
      burger.setAttribute('aria-expanded', 'false');

      // Start closing transitions
      panel.classList.remove('active');
      backdrop.classList.remove('active');
      document.body.classList.remove('menu-open');

      // Hide after CSS transition to avoid flicker (keep in sync with CSS)
      setTimeout(() => {
        panel.hidden = true;
        backdrop.hidden = true;
      }, 200);

      // ===== Unlock scroll & restore position =====
      document.documentElement.classList.remove('scroll-locked');
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
      window.scrollTo(0, menuScrollY || 0);
    }

    // ----- Event bindings -----

    // Toggle by clicking the burger button
    burger.addEventListener('click', () => {
      const expanded = burger.getAttribute('aria-expanded') === 'true';
      expanded ? closeMenu() : openMenu();
    });

    // Click on the backdrop closes the menu
    backdrop.addEventListener('click', closeMenu);

    // Selecting a nav link closes the menu
    panel.querySelectorAll('.nav-link').forEach((a) => {
      a.addEventListener('click', closeMenu);
    });

    // Prevent touch scroll on the backdrop so the page doesn’t move on mobile
    backdrop.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

    // Optional: close on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMenu();
    });
  });
})();
