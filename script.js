// =============================
// Dynamic snap alignment (lite) + Root overlay scrollbar (lite)
// =============================
/* ===========================================
   Dynamic snap alignment (deterministic, lite)
   - Forward between sections  -> snap-start (align top)
   - Backward between sections -> snap-end   (align bottom)
   - Exception: apartment -> header => snap-start (пример)
   - Для статичной разметки: header + ~4 секции + footer
   =========================================== */
(function dynamicSnapAlignLite() {
  'use strict';

  const root = document.documentElement;
  const SECTION_SELECTOR = 'section[id], header[id], footer[id], [data-snap-section]';

  // key: "fromId->toId" -> 'start' | 'end'
  const EXCEPTIONS = {
    'apartment->header': 'start'
  };

  // Состояние snap через один data-атрибут
  let mode = 'start';
  const setMode = (next) => {
    if (next === mode) return;
    mode = next;
    root.dataset.snap = mode; // CSS: html[data-snap="start"] / html[data-snap="end"]
  };
  root.dataset.snap = 'start';

  // Кэш секций
  let SECTIONS = [];       // [{ id, el, top, bottom }]
  let INDEX = new Map();   // id -> index (по вертикали)

  const docTop = (el) => el.getBoundingClientRect().top + window.scrollY;

  function refreshSections() {
    const nodes = Array.from(document.querySelectorAll(SECTION_SELECTOR))
      .map(el => ({ id: el.id || el.getAttribute('data-snap-section'), el }))
      .filter(x => !!x.id);

    const seen = new Set();
    const out = [];
    for (const x of nodes) {
      if (seen.has(x.id)) continue;
      const r = x.el.getBoundingClientRect();
      const h = r.height || x.el.offsetHeight || 0;
      if (h < 120) continue; // игнорим мелкие блоки
      seen.add(x.id);
      out.push(x);
    }

    out.sort((a, b) => docTop(a.el) - docTop(b.el));

    SECTIONS = out.map(s => {
      const top = docTop(s.el);
      const height = s.el.getBoundingClientRect().height || s.el.offsetHeight || 0;
      const bottom = top + height;
      return { id: s.id, el: s.el, top, bottom };
    });
    INDEX = new Map(SECTIONS.map((s, i) => [s.id, i]));
  }

  function currentDominantSectionId() {
    const vh = window.innerHeight || 1;
    const y0 = window.scrollY;
    const y1 = y0 + vh;
    let best = { id: null, vis: -1 };
    for (const s of SECTIONS) {
      const vis = Math.max(0, Math.min(s.bottom, y1) - Math.max(s.top, y0));
      if (vis > best.vis) {
        best = { id: s.id, vis };
        if (vis >= vh) break; // занято весь вьюпорт — лучше не будет
      }
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

  // --- Инициализация и события ---
  refreshSections();
  let activeSectionId = currentDominantSectionId();
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

  window.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(onScrollFrame); }
  }, { passive: true });

  window.addEventListener('resize', () => {
    refreshSections();
    requestAnimationFrame(onScrollFrame);
  }, { passive: true });

  // Anchor clicks (#id): применяем правило сразу (до нативного smooth-scroll)
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href^="#"]');
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

  // Directional hints (не обязательны, но оставим)
  const TOUCH_MIN = 3;
  const HORIZ_BIAS = 6;
  let touchStartY = null, touchStartX = null;

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
    if (Math.abs(dx) > Math.abs(dy) + HORIZ_BIAS) return;
    if (Math.abs(dy) < TOUCH_MIN) return;
    setMode(dy > 0 ? 'start' : 'end');
  }, { passive: true });

  window.addEventListener('touchend', () => { touchStartY = null; touchStartX = null; }, { passive: true });

  // Optional API
  window.__snapDeterministic = {
    refresh: refreshSections,
    addException(from, to, m) { EXCEPTIONS[`${from}->${to}`] = m; },
    removeException(from, to) { delete EXCEPTIONS[`${from}->${to}`]; },
    listExceptions() { return { ...EXCEPTIONS }; },
    listSections() { return SECTIONS.map(s => s.id); }
  };
})();

/* =======================================================
   Overlay Scrollbar — root mode (lite, desktop only)
   - Визуалы задаются CSS (scrollbar.css).
   - JS только создаёт .osb-rail/.osb-thumb и синхронизирует геометрию.
   - Активируется, если <html> или <body> имеет класс "overlay-root".
   - Пропускается на мобильных/планшетах (≤ 992px) и при .menu-open.
   ======================================================= */
(function rootOverlayScrollbarLite() {
  'use strict';

  function init() {
    if (window.__osbRoot) return;

    const hasFlag =
      document.documentElement.classList.contains('overlay-root') ||
      document.body.classList.contains('overlay-root');
    if (!hasFlag) return;

    // Desktop only
    if (window.matchMedia('(max-width: 992px)').matches) return;

    const scroller = document.scrollingElement || document.documentElement;

    // DOM
    const rail = document.createElement('div');
    rail.className = 'osb-rail';
    rail.setAttribute('role', 'scrollbar');
    rail.setAttribute('aria-orientation', 'vertical');
    rail.setAttribute('aria-valuemin', '0');
    rail.setAttribute('aria-valuemax', '100');

    const thumb = document.createElement('div');
    thumb.className = 'osb-thumb';
    rail.appendChild(thumb);
    document.body.appendChild(rail);

    // State
    let dragging = false;
    let trackH = 0, thumbH = 0, maxTop = 0;
    let viewportH = 0, scrollH = 0, maxScroll = 0;
    let dragStartY = 0, startThumbTop = 0;

    const getScrollTop = () => scroller.scrollTop || 0;
    const setScrollTop = (y) => { scroller.scrollTop = y; };

    const metrics = () => ({ vh: window.innerHeight, sh: scroller.scrollHeight });
    const thumbTopFromScroll = (y) => (maxScroll <= 0 ? 0 : Math.round((y / maxScroll) * maxTop));
    const scrollFromThumbTop = (t) => (maxTop   <= 0 ? 0 : (t / maxTop) * maxScroll);

    // Скрывать при .menu-open
    function applyMenuVisibility() {
      const open = document.documentElement.classList.contains('menu-open');
      rail.style.display = open ? 'none' : '';
    }
    const classObserver = new MutationObserver(applyMenuVisibility);
    classObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    applyMenuVisibility();

    // Хендлеры, чтобы их можно было снять в cleanup
    const onScroll = () => updateThumb();
    const onResize = () => {
      if (window.matchMedia('(max-width: 992px)').matches) { cleanup(); return; }
      reposition();
    };
    const onDocPointerUp = (e) => { if (dragging) endDrag(e); };

    function updateThumb() {
      if (dragging) return;

      const { vh, sh } = metrics();
      const padding = 16; // должен совпадать с CSS-инсетами
      const trackHeight = Math.max(window.innerHeight - padding, 0);

      // Нет прокрутки — скрываем
      if (sh <= vh + 1) {
        rail.style.display = 'none';
        return;
      }
      rail.style.display = '';

      const ratio  = vh / Math.max(sh, 1);
      const hThumb = Math.max(40, Math.round(ratio * trackHeight));
      const maxT   = Math.max(trackHeight - hThumb, 0);
      const maxS   = Math.max(sh - vh, 0);
      const y      = getScrollTop();
      const top    = maxS > 0 ? Math.round((y / maxS) * maxT) : 0;

      rail.style.height     = trackHeight + 'px';
      thumb.style.height    = hThumb + 'px';
      thumb.style.transform = 'translateY(' + top + 'px)';
      rail.setAttribute('aria-valuenow', String(Math.round((y / Math.max(maxS, 1)) * 100)));

      trackH = trackHeight; thumbH = hThumb; maxTop = maxT;
      viewportH = vh; scrollH = sh; maxScroll = maxS;
    }

    function reposition() { updateThumb(); }

    // Подписки
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    document.addEventListener('pointerup', onDocPointerUp, { passive: true });

    // Drag
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
      rail.setAttribute('aria-valuenow', String(Math.round((target / Math.max(maxScroll, 1)) * 100)));

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

    // Клик по рейлу — прыжок
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
      rail.setAttribute('aria-valuenow', String(Math.round((targetScroll / Math.max(maxS, 1)) * 100)));
      e.preventDefault();
    });

    function cleanup() {
      try { classObserver.disconnect(); } catch(_) {}
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('pointerup', onDocPointerUp);
      if (rail && rail.parentNode) rail.parentNode.removeChild(rail);
      window.__osbRoot = null;
    }

    // Первая отрисовка
    reposition();

    // Экспорт
    window.__osbRoot = { rail, thumb, remove: cleanup };
  }

  // Init now or on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  // Re-init при изменении брейкпоинта
  const mq = window.matchMedia('(max-width: 992px)');
  const listen = mq.addEventListener ? 'addEventListener' : 'addListener';
  const unlisten = mq.removeEventListener ? 'removeEventListener' : 'removeListener';
  const handler = () => {
    if (mq.matches) {
      if (window.__osbRoot && window.__osbRoot.remove) window.__osbRoot.remove();
    } else {
      if (!window.__osbRoot) init();
    }
  };
  // @ts-ignore legacy support
  mq[listen]('change', handler);

  // При выгрузке страницы — подчистка
  window.addEventListener('beforeunload', () => {
    try { 
      // @ts-ignore legacy support
      mq[unlisten]('change', handler);
      if (window.__osbRoot && window.__osbRoot.remove) window.__osbRoot.remove();
    } catch(_) {}
  }, { passive: true });
})();
