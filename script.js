/* =======================================================
   Overlay Scrollbar — root mode (desktop only)
   ======================================================= */
(function rootOverlayScrollbar() {
  'use strict';

  function init() {
    if (window.__osbRoot) return;

    const hasFlag =
      document.documentElement.classList.contains('overlay-root') ||
      document.body.classList.contains('overlay-root');
    if (!hasFlag) return;

    if (window.matchMedia('(max-width: 992px)').matches) return;

    const scroller = document.scrollingElement || document.documentElement;

    const rail = document.createElement('div');
    rail.className = 'osb-rail';

    const thumb = document.createElement('div');
    thumb.className = 'osb-thumb';

    rail.appendChild(thumb);
    document.body.appendChild(rail);

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
      const padding = 16;
      const trackHeight = Math.max(window.innerHeight - padding, 0);

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

      rail.style.height    = trackHeight + 'px';
      thumb.style.height   = hThumb + 'px';
      thumb.style.transform = 'translateY(' + top + 'px)';

      trackH = trackHeight; thumbH = hThumb; maxTop = maxT;
      viewportH = vh; scrollH = sh; maxScroll = maxS;
    }

    function reposition() { updateThumb(); }

    window.addEventListener('scroll', updateThumb, { passive: true });
    window.addEventListener('resize', () => {
      if (window.matchMedia('(max-width: 992px)').matches) {
        cleanup();
        return;
      }
      reposition();
    }, { passive: true });

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

    reposition();
    window.__osbRoot = { rail, thumb, remove: cleanup };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  const mq = window.matchMedia('(max-width: 992px)');
  const listen = mq.addEventListener ? 'addEventListener' : 'addListener';
  const handler = () => {
    if (mq.matches) {
      if (window.__osbRoot && window.__osbRoot.remove) window.__osbRoot.remove();
    } else {
      if (!window.__osbRoot) init();
    }
  };
  // @ts-ignore legacy
  mq[listen]('change', handler);
})();

// Stable CSS --vh unit for mobile toolbars
(function setCssVhVariable() {
  function setVh() {
    const vh = (window.visualViewport?.height || window.innerHeight || 0) * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
  }
  setVh();
  window.addEventListener('resize', setVh, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', setVh, { passive: true });
  }
})();
