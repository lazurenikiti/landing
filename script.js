// =============================
// Dynamic snap alignment by scroll direction
// =============================
(function dynamicSnapAlignByDirection(){
  const root = document.documentElement;
  let mode = 'start';
  let touchStartY = null;

  function setMode(next) {
    if (next === mode) return;
    mode = next;
    if (mode === 'end') {
      root.classList.add('snap-end');
      root.classList.remove('snap-start');
    } else {
      root.classList.add('snap-start');
      root.classList.remove('snap-end');
    }
  }

  // Initial state: snap to top
  root.classList.add('snap-start');

  // Wheel/trackpad
  window.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) return; // ignore mostly horizontal
    setMode(e.deltaY > 0 ? 'end' : 'start');
  }, { passive: true });

  // Keyboard navigation
  window.addEventListener('keydown', (e) => {
    if (e.key === 'PageDown' || e.key === 'ArrowDown' || e.key === 'End') {
      setMode('end');
    } else if (e.key === 'PageUp' || e.key === 'ArrowUp' || e.key === 'Home') {
      setMode('start');
    }
  }, { passive: true });

  // Touch gestures
  window.addEventListener('touchstart', (e) => {
    if (!e.touches || !e.touches.length) return;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (touchStartY == null || !e.touches || !e.touches.length) return;
    const dy = touchStartY - e.touches[0].clientY;
    if (Math.abs(dy) < 3) return; // dead zone for jitter
    setMode(dy > 0 ? 'end' : 'start');
  }, { passive: true });

  window.addEventListener('touchend', () => { touchStartY = null; }, { passive: true });
})();

/* =======================================================
   Overlay Scrollbar — window (root) mode (normalized)
   - Activates only if html/body has class 'overlay-root'
   - Skips on mobile/tablet (≤ 992px)
   - Hides while mobile menu is open (html.menu-open)
   ======================================================= */
(function () {
  function initRootOverlayScroll() {
    // prevent double init
    if (window.__osbRoot) return;

    // Enable only when overlay-root is present
    const rootHasClass =
      document.documentElement.classList.contains('overlay-root') ||
      document.body.classList.contains('overlay-root');
    if (!rootHasClass) return;

    // Skip on mobile/tablet (≤992px)
    if (window.matchMedia('(max-width: 992px)').matches) {
      const existing = document.querySelector('.osb-rail');
      if (existing) existing.remove();
      return;
    }

    // The single page scroller (browser default)
    const scroller = document.scrollingElement || document.documentElement;

    // Rail + Thumb (fixed at right edge)
    const rail  = document.createElement('div');
    rail.className = 'osb-rail';
    rail.style.width = '10px';   // safe width, not overlapping typical UI at the corner
    rail.style.right = '8px';
    rail.style.top = '8px';
    rail.style.bottom = '8px';

    const thumb = document.createElement('div');
    thumb.className = 'osb-thumb';
    rail.appendChild(thumb);
    document.body.appendChild(rail);

    // Perf hints
    thumb.style.willChange = 'transform';
    thumb.style.touchAction = 'none';

    // Helpers
    const getScrollTop = () => scroller.scrollTop || 0;
    const setScrollTop = (y) => { scroller.scrollTop = y; };

    function getMetrics() {
      const vh = window.innerHeight;
      const sh = scroller.scrollHeight;
      return { vh, sh };
    }

    // Cached metrics for drag session
    let trackH = 0, thumbH = 0, maxTop = 0;
    let viewportH = 0, scrollH = 0, maxScroll = 0;

    const thumbTopFromScroll = (y) => (maxScroll <= 0 ? 0 : Math.round((y / maxScroll) * maxTop));
    const scrollFromThumbTop = (t) => (maxTop   <= 0 ? 0 : (t / maxTop) * maxScroll);

    // Sync scroll -> thumb (disabled while dragging)
    let dragging = false;
    function updateThumb() {
      if (dragging) return;

      const { vh, sh } = getMetrics();
      const trackHeight = Math.max(window.innerHeight - 16, 0); // 8px padding top/bottom

      // No scroll — hide rail
      if (sh <= vh + 1) { rail.style.display = 'none'; return; }
      rail.style.display = '';

      const ratio  = vh / Math.max(sh, 1);
      const hThumb = Math.max(40, Math.round(ratio * trackHeight));
      const maxT   = Math.max(trackHeight - hThumb, 0);
      const maxS   = Math.max(sh - vh, 0);
      const y      = getScrollTop();
      const top    = maxS > 0 ? Math.round((y / maxS) * maxT) : 0;

      rail.style.height = trackHeight + 'px';
      thumb.style.height = hThumb + 'px';
      thumb.style.transform = 'translateY(' + top + 'px)';

      trackH = trackHeight; thumbH = hThumb; maxTop = maxT;
      viewportH = vh; scrollH = sh; maxScroll = maxS;
    }

    function positionRail() {
      // positions already set; just update thumb
      updateThumb();
    }

    // Hide rail while mobile menu is open (to avoid hit-testing conflicts)
    function applyMenuOpenVisibility() {
      const open = document.documentElement.classList.contains('menu-open');
      rail.style.display = open ? 'none' : '';
    }
    const classObserver = new MutationObserver(applyMenuOpenVisibility);
    classObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    applyMenuOpenVisibility();

    // Events
    window.addEventListener('scroll', updateThumb, { passive: true });
    window.addEventListener('resize', () => {
      // If resized into mobile mode — remove rail
      if (window.matchMedia('(max-width: 992px)').matches) {
        try { classObserver.disconnect(); } catch(_) {}
        rail.remove();
        window.__osbRoot = null;
        return;
      }
      positionRail();
    }, { passive: true });

    // Initial render
    positionRail();

    // ===== Drag (immediate mapping; no smooth scroll) =====
    let dragStartY = 0;
    let startThumbTop = 0;

    let prevScrollBehavior = '';
    const disableSmooth = () => {
      prevScrollBehavior = scroller.style.scrollBehavior || '';
      scroller.style.scrollBehavior = 'auto';
    };
    const restoreSmooth = () => {
      scroller.style.scrollBehavior = prevScrollBehavior;
    };

    thumb.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;

      dragging = true;
      thumb.setPointerCapture(e.pointerId);

      const { vh, sh } = getMetrics();
      viewportH = vh;
      scrollH   = sh;
      trackH    = Math.max(window.innerHeight - 16, 0);
      thumbH    = thumb.getBoundingClientRect().height || 40;
      maxTop    = Math.max(trackH - thumbH, 0);
      maxScroll = Math.max(scrollH - viewportH, 0);

      dragStartY = e.clientY;
      startThumbTop = thumbTopFromScroll(getScrollTop());

      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'grabbing';
      disableSmooth();
      e.preventDefault();
    });

    thumb.addEventListener('pointermove', (e) => {
      if (!dragging) return;

      const evts = (typeof e.getCoalescedEvents === 'function') ? e.getCoalescedEvents() : null;
      const last = evts && evts.length ? evts[evts.length - 1] : e;

      const dy = last.clientY - dragStartY;
      let nextTop = startThumbTop + dy;
      if (nextTop < 0) nextTop = 0;
      if (nextTop > maxTop) nextTop = maxTop;

      // Immediate visual move
      thumb.style.transform = 'translateY(' + nextTop + 'px)';

      // Map thumb to scrollTop directly
      const target = scrollFromThumbTop(nextTop);
      setScrollTop(target);

      e.preventDefault();
    }, { passive: false });

    const endDrag = (e) => {
      if (!dragging) return;
      dragging = false;
      try { if (e && e.pointerId != null) thumb.releasePointerCapture(e.pointerId); } catch(_) {}
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      restoreSmooth();
      updateThumb();
    };

    thumb.addEventListener('pointerup', endDrag);
    thumb.addEventListener('pointercancel', endDrag);
    document.addEventListener('pointerup', (e) => { if (dragging) endDrag(e); }, { passive: true });

    // Click on rail to jump
    rail.addEventListener('mousedown', (e) => {
      if (e.target === thumb) return;
      const rect = rail.getBoundingClientRect();
      const clickY = e.clientY - rect.top;

      const { vh, sh } = getMetrics();
      const trackHeight = Math.max(window.innerHeight - 16, 0);
      const hThumb = Math.max(40, Math.round((vh / Math.max(sh,1)) * trackHeight));
      const maxT   = Math.max(trackHeight - hThumb, 0);
      const maxS   = Math.max(sh - vh, 0);

      const targetTop    = Math.min(Math.max(clickY - hThumb / 2, 0), maxT);
      const targetScroll = (targetTop / Math.max(maxT,1)) * maxS;

      setScrollTop(targetScroll);
      rail.style.height = trackHeight + 'px';
      thumb.style.height = hThumb + 'px';
      thumb.style.transform = 'translateY(' + targetTop + 'px)';
      e.preventDefault();
    });

    // expose (optional)
    window.__osbRoot = { rail, thumb, remove() { try { classObserver.disconnect(); } catch(_) {} rail.remove(); window.__osbRoot = null; } };
  }

  // init now or on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRootOverlayScroll, { once: true });
  } else {
    initRootOverlayScroll();
  }

  // Re-init when crossing the 992px breakpoint (desktop <-> mobile)
  const mq = window.matchMedia('(max-width: 992px)');
  (mq.addEventListener || mq.addListener).call(mq, 'change' in mq ? 'change' : undefined, () => {
    if (mq.matches) {
      if (window.__osbRoot && window.__osbRoot.remove) window.__osbRoot.remove();
    } else {
      if (!window.__osbRoot) initRootOverlayScroll();
    }
  });
})();
