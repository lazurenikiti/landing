document.addEventListener("DOMContentLoaded", function () {
  // =============================
  // HERO: background crossfade + typing/erasing caption
  // =============================
  const backgrounds = [
    'images/hero/karidi.webp',
    'images/hero/halkidiki.webp',
    'images/hero/sunset.webp',
    'images/hero/platanitsi.webp',
    'images/hero/daisymeadow.webp'
  ];

  const captions = [
    'Explore the Beauties of Sithonia.',
    'Dream Wied.',
    'Relax.',
    'Visit the Lazure Beaches.',
    'Feel the Greece.'
  ];

  const bg1 = document.querySelector('.bg1');
  const bg2 = document.querySelector('.bg2');
  const captionEl = document.getElementById('hero-caption');

  let index = 0;
  let active = true;

  if (bg1 && bg2) {
    bg1.style.backgroundImage = `url('${backgrounds[0]}')`;
    bg1.classList.add('active');
  }

  if (captionEl) {
    typeText(captions[0], () => {
      setTimeout(scheduleSlideChange, 5000);
    });
  }

  function scheduleSlideChange() {
    eraseText(() => {
      changeBackground();
      typeText(captions[index], () => {
        setTimeout(scheduleSlideChange, 5000);
      });
    });
  }

  function changeBackground() {
    if (!bg1 || !bg2) return;
    const nextIndex = (index + 1) % backgrounds.length;
    const incoming = active ? bg2 : bg1;
    const outgoing = active ? bg1 : bg2;

    incoming.style.backgroundImage = `url('${backgrounds[nextIndex]}')`;
    incoming.classList.add('active');
    outgoing.classList.remove('active');

    active = !active;
    index = nextIndex;
  }

  function typeText(text, callback) {
    if (!captionEl) { if (callback) callback(); return; }
    let charIndex = 0;
    function type() {
      if (charIndex <= text.length) {
        captionEl.textContent = text.substring(0, charIndex);
        charIndex++;
        setTimeout(type, 60);
      } else {
        if (callback) callback();
      }
    }
    type();
  }

  function eraseText(callback) {
    if (!captionEl) { if (callback) callback(); return; }
    let text = captionEl.textContent;
    let charIndex = text.length;
    function erase() {
      if (charIndex >= 0) {
        captionEl.textContent = text.substring(0, charIndex);
        charIndex--;
        setTimeout(erase, 30);
      } else {
        if (callback) callback();
      }
    }
    setTimeout(erase, 500);
  }

  // =============================
  // NAVBAR: burger menu w/ blur overlay and smooth center reveal
  // =============================
  (function initMobileNavbar() {
    const nav = document.getElementById("navbarNav");
    const toggler = document.querySelector(".navbar-toggler");
    if (!nav || !toggler) return;

    // Create the blur/dim overlay once
    let backdrop = document.querySelector(".menu-backdrop");
    if (!backdrop) {
      backdrop = document.createElement("div");
      backdrop.className = "menu-backdrop";
      document.body.appendChild(backdrop);
    }

    // If Bootstrap/jQuery are present, wire up collapse lifecycle for smooth timing
    if (window.jQuery && typeof jQuery.fn.collapse === "function") {
      const $nav = jQuery(nav);

      // Start opening: show overlay and lock page immediately (removes gap between overlay and menu animation)
      $nav.on("show.bs.collapse", function () {
        document.body.classList.add("menu-open");
        document.body.classList.remove("menu-opening");
      });

      // Fully opened: ensure final state
      $nav.on("shown.bs.collapse", function () {
        document.body.classList.add("menu-open");
        document.body.classList.remove("menu-opening");
      });

      // Start closing: keep short intermediate state (prevents flicker on fast taps)
      $nav.on("hide.bs.collapse", function () {
        document.body.classList.remove("menu-open");
        document.body.classList.add("menu-opening");
      });

      // Fully closed: clear all helper classes
      $nav.on("hidden.bs.collapse", function () {
        document.body.classList.remove("menu-opening");
      });

      // Click on overlay closes the menu
      backdrop.addEventListener("click", function () {
        if ($nav.hasClass("show")) $nav.collapse("hide");
      });

      // Click on any nav link closes the menu
      document.querySelectorAll(".navbar .nav-link").forEach((link) => {
        link.addEventListener("click", function () {
          if ($nav.hasClass("show")) $nav.collapse("hide");
        });
      });

      // Safety: if the menu appears open on load (e.g., hot reload), close it
      if ($nav.hasClass("show")) $nav.collapse("hide");
    } else {
      // Fallback (no Bootstrap): simple toggle to add/remove body classes and overlay behavior
      toggler.addEventListener("click", () => {
        const isOpen = document.body.classList.toggle("menu-open");
        if (!isOpen) document.body.classList.remove("menu-opening");
      });
      backdrop.addEventListener("click", () => {
        document.body.classList.remove("menu-open", "menu-opening");
      });
      document.querySelectorAll(".navbar .nav-link").forEach((link) => {
        link.addEventListener("click", () => {
          document.body.classList.remove("menu-open", "menu-opening");
        });
      });
    }
  })();

  /* Overlay Scrollbar — window (root) mode (normalized, zero-lag) */
  (function () {
    function initRootOverlayScroll() {
      if (window.__osbRoot) return;

      // Включать root-режим только если есть класс overlay-root на html или body
      const rootHasClass =
        document.documentElement.classList.contains('overlay-root') ||
        document.body.classList.contains('overlay-root');
      if (!rootHasClass) return;

      // ЕДИНСТВЕННЫЙ скроллер страницы
      const scroller = document.scrollingElement || document.documentElement;

      // Рельса и ползунок (фикс справа экрана)
      const rail  = document.createElement('div');
      rail.className = 'osb-rail';
      const thumb = document.createElement('div');
      thumb.className = 'osb-thumb';
      rail.appendChild(thumb);
      document.body.appendChild(rail);

      // Оптимизации
      thumb.style.willChange = 'transform';
      thumb.style.touchAction = 'none';

      // Быстрый доступ к скроллу
      const getScrollTop = () => scroller.scrollTop || 0;
      const setScrollTop = (y) => { scroller.scrollTop = y; };

      // Метрики документа/вьюпорта
      function getMetrics() {
        const vh = window.innerHeight;
        const sh = scroller.scrollHeight;
        return { vh, sh };
      }

      // Позиционируем рельсу (фикс) и обновляем ползунок
      function positionRail() {
        rail.style.top = '8px';
        rail.style.bottom = '8px';
        rail.style.right = '8px';
        updateThumb();
      }

      // Кэш для drag-сессии
      let trackH = 0, thumbH = 0, maxTop = 0;
      let viewportH = 0, scrollH = 0, maxScroll = 0;

      // thumb <—> scroll
      const thumbTopFromScroll = (y) => (maxScroll <= 0 ? 0 : Math.round((y / maxScroll) * maxTop));
      const scrollFromThumbTop = (t) => (maxTop   <= 0 ? 0 : (t / maxTop) * maxScroll);

      // Синк scroll -> thumb (пока не тащим)
      let dragging = false;
      function updateThumb() {
        if (dragging) return;

        const { vh, sh } = getMetrics();
        const trackHeight = Math.max(window.innerHeight - 16, 0); // 8px сверху/снизу

        // Нет скролла — прячем рельсу
        if (sh <= vh + 1) { rail.style.display = 'none'; return; }
        rail.style.display = '';

        const ratio  = vh / Math.max(sh, 1);
        const hThumb = Math.max(40, Math.round(ratio * trackHeight));
        const maxT   = Math.max(trackHeight - hThumb, 0);
        const maxS   = Math.max(sh - vh, 0);
        const y      = getScrollTop();
        const top    = maxS > 0 ? Math.round((y / maxS) * maxT) : 0;

        // Применяем
        rail.style.height = trackHeight + 'px';
        thumb.style.height = hThumb + 'px';
        thumb.style.transform = 'translateY(' + top + 'px)';

        // Кэш на будущее
        trackH = trackHeight; thumbH = hThumb; maxTop = maxT;
        viewportH = vh; scrollH = sh; maxScroll = maxS;
      }

      // События окна
      window.addEventListener('scroll', updateThumb, { passive: true });
      window.addEventListener('resize', positionRail, { passive: true });

      // Первый рендер
      positionRail();

      // ===== Drag (мгновенное соответствие; без rAF/scrollTo) =====
      let dragStartY = 0;
      let startThumbTop = 0;

      // На время драга отключаем плавный скролл у реального скроллера
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

        // Кэш метрик на старт
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

        // Берём самый свежий coalesced event (если доступен)
        const evts = (typeof e.getCoalescedEvents === 'function') ? e.getCoalescedEvents() : null;
        const last = evts && evts.length ? evts[evts.length - 1] : e;

        const dy = last.clientY - dragStartY;
        let nextTop = startThumbTop + dy;
        if (nextTop < 0) nextTop = 0;
        if (nextTop > maxTop) nextTop = maxTop;

        // Двигаем визуально СРАЗУ
        thumb.style.transform = 'translateY(' + nextTop + 'px)';

        // И мгновенно ставим scrollTop напрямую (как нативный)
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
        updateThumb(); // финальная синхронизация
      };

      thumb.addEventListener('pointerup', endDrag);
      thumb.addEventListener('pointercancel', endDrag);
      document.addEventListener('pointerup', (e) => { if (dragging) endDrag(e); }, { passive: true });

      // Клик по рельсе — перейти сразу
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

      window.__osbRoot = { rail, thumb };
    }

    // Инициализация
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initRootOverlayScroll);
    } else {
      initRootOverlayScroll();
    }
  })();
});
