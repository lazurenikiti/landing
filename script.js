// =============================
// Dynamic snap alignment + Root overlay scrollbar (CSS-driven)
// =============================

/* ===========================================
   Dynamic snap alignment (deterministic)
   - Forward between sections  -> snap-start (align top)
   - Backward between sections -> snap-end   (align bottom)
   - Exception: apartment -> header => snap-start
   - Works for ALL sections collected from DOM
   =========================================== */
(function dynamicSnapAlign() {
  'use strict';

  const root = document.documentElement;
  let mode = 'start';
  let touchStartY = null;
  let touchStartX = null;

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

  // Initial state
  root.classList.add('snap-start');

  // Deterministic rules for ALL transitions (with exceptions)
  const SECTION_SELECTOR = 'section[id], header[id], footer[id], [data-snap-section]';
  // key: "fromId->toId" -> 'start' | 'end'
  const EXCEPTIONS = {
    'apartment->header': 'start'
  };

  function collectSections() {
    const nodes = Array.from(document.querySelectorAll(SECTION_SELECTOR))
      .map(el => ({ id: el.id || el.getAttribute('data-snap-section'), el }))
      .filter(x => !!x.id);

    const seen = new Set();
    const out = [];
    for (const x of nodes) {
      if (seen.has(x.id)) continue;
      const r = x.el.getBoundingClientRect();
      const h = r.height || x.el.offsetHeight || 0;
      if (h < 120) continue; // ignore tiny blocks
      seen.add(x.id);
      out.push(x);
    }

    out.sort((a, b) => {
      const ay = a.el.offsetTop ?? a.el.getBoundingClientRect().top;
      const by = b.el.offsetTop ?? b.el.getBoundingClientRect().top;
      return ay - by;
    });
    return out;
  }

  let SECTIONS = collectSections();
  let INDEX = new Map(SECTIONS.map((s, i) => [s.id, i]));

  function refreshSections() {
    SECTIONS = collectSections();
    INDEX = new Map(SECTIONS.map((s, i) => [s.id, i]));
  }

  function currentDominantSectionId() {
    const vh = window.innerHeight || 1;
    let best = { id: null, score: 0 };
    for (const { id, el } of SECTIONS) {
      const r = el.getBoundingClientRect();
      if (r.bottom <= 0 || r.top >= vh) continue;
      const visible = Math.min(r.bottom, vh) - Math.max(r.top, 0);
      const score = visible / Math.max(Math.min(r.height, vh), 1);
      if (score > best.score) best = { id, score };
    }
    return best.id;
  }

  function applyDeterministicRule(fromId, toId) {
    if (!fromId || !toId || fromId === toId) return;

    const key = `${fromId}->${toId}`;
    if (EXCEPTIONS[key]) {
      setMode(EXCEPTIONS[key]);
      return;
    }

    const iFrom = INDEX.get(fromId);
    const iTo   = INDEX.get(toId);
    if (iFrom == null || iTo == null) return;

    if (iTo > iFrom) setMode('start'); // forward
    else if (iTo < iFrom) setMode('end'); // backward
  }

  let activeSectionId = null;
  let ticking = false;

  function onScrollFrame() {
    ticking = false;
    const nextId = currentDominantSectionId();
    if (!nextId) return;
    if (activeSectionId && nextId !== activeSectionId) {
      applyDeterministicRule(activeSectionId, nextId);
    }
    activeSectionId = nextId;
  }

  // Init + observers
  refreshSections();
  requestAnimationFrame(() => { activeSectionId = currentDominantSectionId(); });

  const ro = ('ResizeObserver' in window) ? new ResizeObserver(() => {
    refreshSections();
    requestAnimationFrame(onScrollFrame);
  }) : null;
  if (ro) SECTIONS.forEach(s => ro.observe(s.el));

  window.addEventListener('resize', () => {
    refreshSections();
    requestAnimationFrame(onScrollFrame);
  }, { passive: true });

  window.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(onScrollFrame); }
  }, { passive: true });

  // Anchor clicks (#id): apply rule immediately (before native smooth-scroll)
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const targetId = (a.getAttribute('href') || '').slice(1);
    if (!targetId) return;

    if (!activeSectionId) activeSectionId = currentDominantSectionId() || targetId;
    applyDeterministicRule(activeSectionId, targetId);
    requestAnimationFrame(() => { activeSectionId = currentDominantSectionId() || targetId; });
  }, { passive: true });

  // Hash changes (script-driven)
  window.addEventListener('hashchange', () => {
    const targetId = location.hash.replace(/^#/, '');
    if (!targetId) return;
    if (!activeSectionId) activeSectionId = currentDominantSectionId() || targetId;
    applyDeterministicRule(activeSectionId, targetId);
    requestAnimationFrame(() => { activeSectionId = currentDominantSectionId() || targetId; });
  }, { passive: true });

  // Directional inputs remain (overridden by deterministic rule when section actually changes)
  window.addEventListener('wheel', (e) => {
    if (window.__carouselDragging) return;
    if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
    setMode(e.deltaY > 0 ? 'start' : 'end');
  }, { passive: true });

  window.addEventListener('keydown', (e) => {
    if (window.__carouselDragging) return;
    if (e.key === 'PageDown' || e.key === 'ArrowDown' || e.key === 'End') setMode('start');
    else if (e.key === 'PageUp' || e.key === 'ArrowUp' || e.key === 'Home') setMode('end');
  }, { passive: true });

  window.addEventListener('touchstart', (e) => {
    if (!e.touches || !e.touches.length) return;
    touchStartY = e.touches[0].clientY;
    touchStartX = e.touches[0].clientX;
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (window.__carouselDragging) return;
    if (touchStartY == null || !e.touches || !e.touches.length) return;

    const t = e.touches[0];
    const dy = touchStartY - t.clientY;
    const dx = touchStartX == null ? 0 : touchStartX - t.clientX;

    if (Math.abs(dx) > Math.abs(dy) + 6) return; // horizontal-dominant
    if (Math.abs(dy) < 3) return;                // too small

    setMode(dy > 0 ? 'start' : 'end');
  }, { passive: true });

  window.addEventListener('touchend', () => { touchStartY = null; touchStartX = null; }, { passive: true });

  // Optional API
  window.__snapDeterministic = {
    refresh: refreshSections,
    addException(from, to, mode) { EXCEPTIONS[`${from}->${to}`] = mode; },
    removeException(from, to) { delete EXCEPTIONS[`${from}->${to}`]; },
    listExceptions() { return { ...EXCEPTIONS }; },
    listSections() { return SECTIONS.map(s => s.id); }
  };
})();

/* =======================================================
   Overlay Scrollbar — root mode (desktop only)
   - Uses your CSS (scrollbar.css) for all visuals.
   - JS only creates .osb-rail/.osb-thumb and updates size/position.
   - Activates if <html> or <body> has class "overlay-root".
   - Skips on mobile/tablet (≤ 992px) — CSS also hides on coarse pointer.
   - Hides while html has class "menu-open".
   ======================================================= */
(function rootOverlayScrollbar() {
  'use strict';

  function init() {
    if (window.__osbRoot) return;

    const hasFlag =
      document.documentElement.classList.contains('overlay-root') ||
      document.body.classList.contains('overlay-root');
    if (!hasFlag) return;

    // Skip small screens; CSS also hides via media queries,
    // but we avoid creating DOM nodes at all here.
    if (window.matchMedia('(max-width: 992px)').matches) return;

    const scroller = document.scrollingElement || document.documentElement;

    // Create DOM structure (styles come from scrollbar.css)
    const rail = document.createElement('div');
    rail.className = 'osb-rail';

    const thumb = document.createElement('div');
    thumb.className = 'osb-thumb';

    rail.appendChild(thumb);
    document.body.appendChild(rail);

    // Dynamic metrics/state
    let dragging = false;
    let trackH = 0, thumbH = 0, maxTop = 0;
    let viewportH = 0, scrollH = 0, maxScroll = 0;
    let dragStartY = 0, startThumbTop = 0;

    const getScrollTop = () => scroller.scrollTop || 0;
    const setScrollTop = (y) => { scroller.scrollTop = y; };

    function metrics() {
      return { vh: window.innerHeight, sh: scroller.scrollHeight };
    }

    const thumbTopFromScroll = (y) => (maxScroll <= 0 ? 0 : Math.round((y / maxScroll) * maxTop));
    const scrollFromThumbTop = (t) => (maxTop   <= 0 ? 0 : (t / maxTop) * maxScroll);

    // Keep rail hidden when no scroll or menu is open
    function applyMenuVisibility() {
      const open = document.documentElement.classList.contains('menu-open');
      rail.style.display = open ? 'none' : '';
    }
    const classObserver = new MutationObserver(applyMenuVisibility);
    classObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    applyMenuVisibility();

    function updateThumb() {
      if (dragging) return;

      const { vh, sh } = metrics();
      const padding = 16; // must match CSS top/bottom insets (8px + 8px)
      const trackHeight = Math.max(window.innerHeight - padding, 0);

      // Hide if page does not scroll
      if (sh <= vh + 1) {
        rail.style.display = 'none';
        return;
      }
      rail.style.display = '';

      const ratio  = vh / Math.max(sh, 1);
      const hThumb = Math.max(40, Math.round(ratio * trackHeight)); // min 40px (defined in CSS too)
      const maxT   = Math.max(trackHeight - hThumb, 0);
      const maxS   = Math.max(sh - vh, 0);
      const y      = getScrollTop();
      const top    = maxS > 0 ? Math.round((y / maxS) * maxT) : 0;

      // Only dynamic geometries here:
      rail.style.height    = trackHeight + 'px';
      thumb.style.height   = hThumb + 'px';
      thumb.style.transform = 'translateY(' + top + 'px)';

      trackH = trackHeight; thumbH = hThumb; maxTop = maxT;
      viewportH = vh; scrollH = sh; maxScroll = maxS;
    }

    function reposition() { updateThumb(); }

    // Events
    window.addEventListener('scroll', updateThumb, { passive: true });
    window.addEventListener('resize', () => {
      if (window.matchMedia('(max-width: 992px)').matches) {
        cleanup();
        return;
      }
      reposition();
    }, { passive: true });

    // Drag logic (no visual styling set here, CSS handles appearance)
    let prevScrollBehavior = '';
    const disableSmooth = () => {
      prevScrollBehavior = scroller.style.scrollBehavior || '';
      scroller.style.scrollBehavior = 'auto';
    };
    const restoreSmooth = () => { scroller.style.scrollBehavior = prevScrollBehavior; };

    thumb.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      dragging = true;
      thumb.setPointerCapture(e.pointerId);

      const { vh, sh } = metrics();
      viewportH = vh;
      scrollH   = sh;

      const padding = 16;
      trackH    = Math.max(window.innerHeight - padding, 0);
      thumbH    = thumb.getBoundingClientRect().height || 40;
      maxTop    = Math.max(trackH - thumbH, 0);
      maxScroll = Math.max(scrollH - viewportH, 0);

      dragStartY    = e.clientY;
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

      thumb.style.transform = 'translateY(' + nextTop + 'px)';

      const target = scrollFromThumbTop(nextTop);
      setScrollTop(target);

      e.preventDefault();
    }, { passive: false });

    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      try { if (e && e.pointerId != null) thumb.releasePointerCapture(e.pointerId); } catch(_) {}
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      restoreSmooth();
      updateThumb();
    }

    thumb.addEventListener('pointerup', endDrag);
    thumb.addEventListener('pointercancel', endDrag);
    document.addEventListener('pointerup', (e) => { if (dragging) endDrag(e); }, { passive: true });

    // Click on rail to jump
    rail.addEventListener('mousedown', (e) => {
      if (e.target === thumb) return;
      const rect = rail.getBoundingClientRect();
      const clickY = e.clientY - rect.top;

      const { vh, sh } = metrics();
      const padding = 16;
      const trackHeight = Math.max(window.innerHeight - padding, 0);
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

    function cleanup() {
      try { classObserver.disconnect(); } catch(_) {}
      if (rail && rail.parentNode) rail.parentNode.removeChild(rail);
      window.__osbRoot = null;
    }

    // Initial paint
    reposition();

    // Expose handle
    window.__osbRoot = { rail, thumb, remove: cleanup };
  }

  // Init now or on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  // Re-init when crossing the desktop breakpoint
  const mq = window.matchMedia('(max-width: 992px)');
  const listen = mq.addEventListener ? 'addEventListener' : 'addListener';
  const handler = () => {
    if (mq.matches) {
      if (window.__osbRoot && window.__osbRoot.remove) window.__osbRoot.remove();
    } else {
      if (!window.__osbRoot) init();
    }
  };
  // @ts-ignore legacy support
  mq[listen]('change', handler);
})();
