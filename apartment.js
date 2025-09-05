// apartment.js — desktop/mobile gallery with fullscreen thumb strip (Fade)
// - Desktop builds thumbnails from /thumbs
// - Mobile uses a scroll-snap carousel (no transforms)
// - Fullscreen overlay locks page scroll without jumps
// - Fullscreen navigation is swipe-only; close only by the X button
// - Bottom thumb strip appears on interaction and hides after 1.5s
// - All comments are in English

document.addEventListener('DOMContentLoaded', function () {
  /* =================== Environment & config =================== */
  var isPhone = (/(Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini)/i).test(navigator.userAgent)
                && Math.min(screen.width, screen.height) <= 900;

  if (isPhone) {
    document.documentElement.classList.add('force-mobile'); // legacy CSS hook
  }

  var ORIG_DIR  = 'images/apartment/';
  var THUMB_DIR = 'images/apartment/thumbs/';

  // Fullscreen thumbs bar timing (ms)
  var FS_STRIP_HIDE_DELAY = 1500;       // default auto-hide
  var FS_STRIP_HIDE_DELAY_MANUAL = 3500; // when explicitly shown by double-tap

  // Timer handle for the strip
  var fsStripTimer = null;

  var FS_ANIM_MS = 220;           // fade duration

  var imageList = [
    'Pool_map.webp','Inner_1_map.webp','Inner_2_map.webp','Inner_3_map.webp',
    'Inner_4_map.webp','Inner_5_map.webp','Kitchen_1_map.webp','Kitchen_2_map.webp',
    'Bath_map.webp','Garden_map.webp','Outer_map.webp','Playground_map.webp'
  ];

  /* =================== DOM refs =================== */
  var mainPhotoFrame = document.getElementById('main-photo-frame');
  var thumbsGrid     = document.querySelector('.thumbs-grid');
  var carouselTrack  = document.getElementById('carousel-track');
  var carouselDots   = document.getElementById('carousel-dots');
  var btnLeft        = document.getElementById('main-left');
  var btnRight       = document.getElementById('main-right');

  // Fullscreen overlay
  var overlay = document.getElementById('fullscreen-overlay');
  var fsImage = document.getElementById('fs-image');
  var fsClose = document.getElementById('fs-close');

  // Built on first fullscreen open
  var fsThumbsBar = null;   // #fs-thumbs
  var fsThumbsTrack = null; // #fs-thumbs-track

  /* =================== State =================== */
  var currentIndex = 0;
  var mql = window.matchMedia('(max-width: 767.98px)');
  var slides = [];                 // mobile slides (elements)
  var builtDesktopThumbs = false;
  var thumbElems = [];             // desktop thumbs <img>
  var activeThumbEl = null;
  var switching = false;           // guard for main image switching
  var _scrollY = 0;

  // Thumb strip visibility timer
  var fsStripTimer = null;

  /* =================== Main image element =================== */
  var mainImg = document.createElement('img');
  mainImg.alt = 'Apartment main photo';
  mainImg.decoding = 'async';
  mainImg.loading = 'eager';
  if (mainPhotoFrame) mainPhotoFrame.appendChild(mainImg);

  /* =================== Desktop thumbs =================== */
  function buildDesktopThumbsIfNeeded() {
    if (!thumbsGrid || builtDesktopThumbs || mql.matches || isPhone) return;

    var frag = document.createDocumentFragment();
    for (var i = 0; i < imageList.length; i++) {
      var el = document.createElement('img');
      el.className = 'thumb';
      el.alt = 'Thumbnail ' + (i + 1);
      el.loading = 'lazy';
      el.decoding = 'async';
      el.src = THUMB_DIR + imageList[i];
      frag.appendChild(el);
    }
    thumbsGrid.appendChild(frag);

    thumbElems = Array.prototype.slice.call(thumbsGrid.querySelectorAll('.thumb'));
    builtDesktopThumbs = true;

    thumbsGrid.addEventListener('click', function (e) {
      var el = e.target && e.target.closest ? e.target.closest('.thumb') : null;
      if (!el) return;
      var idx = thumbElems.indexOf(el);
      if (idx !== -1) switchMainTo(idx);
    });

    setActiveThumb(currentIndex);
  }

  function setActiveThumb(i) {
    if (!builtDesktopThumbs) return;
    var nextEl = thumbElems[i];
    if (nextEl === activeThumbEl) return;
    if (activeThumbEl) activeThumbEl.classList.remove('active-thumb');
    if (nextEl) nextEl.classList.add('active-thumb');
    activeThumbEl = nextEl;
  }

  /* =================== Switching main image (desktop area) =================== */
  function switchMainTo(index) {
    index = (index + imageList.length) % imageList.length;
    if (switching || index === currentIndex) {
      setActiveThumb(index);
      return;
    }
    switching = true;

    var nextSrc = ORIG_DIR + imageList[index];
    try {
      if (mainImg && mainImg.src !== nextSrc) {
        var preload = new Image();
        preload.src = nextSrc;
        if (preload.decode) {
          preload.decode().then(apply).catch(apply);
        } else {
          apply();
        }
      } else {
        apply();
      }
    } catch (_e) {
      apply();
    }

    function apply() {
      window.requestAnimationFrame(function () {
        if (mainImg && mainImg.src !== nextSrc) mainImg.src = nextSrc;
        setActiveThumb(index);
        currentIndex = index;
        syncFullscreenVisuals(); // keep fullscreen in sync if open
        switching = false;
      });
    }
  }

  /* =================== Mobile carousel — 5-car train (robust, orientation-safe) =================== */
  function buildMobileCarouselOnce() {
    if (!carouselTrack || !carouselDots) return;

    // Always rebuild mobile carousel content (clean state for slides)
    if (typeof slides !== 'undefined') slides = [];

    var n = imageList.length;
    if (n === 0) return;

    // ----- Local state -----
    var current = 0;            // logical index [0..n-1], kept in sync with currentIndex
    var w = 1;                  // slide width in px (measured from container)
    var dragging = false;
    var startX = 0, dx = 0, startT = 0;
    var pointerId = null;
    var animating = false;

    // ----- Stable measurement target (container, not the track) -----
    var mobileCarouselEl = document.getElementById('mobile-carousel');

    // ----- Prebuild/cache ALL images off-DOM (once per init) -----
    var cache = new Array(n);
    for (var i = 0; i < n; i++) {
      var im = new Image();
      im.decoding = 'async';
      if ('fetchPriority' in im) im.fetchPriority = 'low';
      im.src = ORIG_DIR + imageList[i];
      cache[i] = im;
    }

    // ----- Build exactly five cars in the DOM: [prev2 | prev1 | current | next1 | next2] -----
    carouselTrack.innerHTML = '';
    var indices = [0,1,2,3,4]; // logical indices for the 5-car window (computed below)

    function makeCar() {
      var el = document.createElement('div');
      el.className = 'slide';
      var img = document.createElement('img');
      img.decoding = 'async';
      el.appendChild(img);
      return { el: el, img: img };
    }

    var carPrev2 = makeCar();
    var carPrev1 = makeCar();
    var carCurr  = makeCar();
    var carNext1 = makeCar();
    var carNext2 = makeCar();

    // Open fullscreen on tap (current car only; ignore when dragging/animating)
    carCurr.img.addEventListener('click', function(){
      if (!animating && !dragging) openFullscreen(current);
    });

    [carPrev2, carPrev1, carCurr, carNext1, carNext2].forEach(function(c){
      carouselTrack.appendChild(c.el);
    });

    // ----- Dots (rebuild) -----
    carouselDots.innerHTML = '';
    for (var d = 0; d < n; d++) {
      var dot = document.createElement('button');
      dot.type = 'button';
      dot.setAttribute('role', 'tab');
      dot.setAttribute('aria-label', 'Slide ' + (d + 1));
      (function(idx){
        dot.addEventListener('click', function(){
          if (animating) return;
          var delta = shortestDelta(current, idx, n);
          if (delta === 0) return;
          // If |delta| <= 2: animate via sequence of single steps; else teleport
          if (Math.abs(delta) <= 2) stepSequence(delta);
          else teleportTo(idx);
        });
      })(d);
      carouselDots.appendChild(dot);
    }

    // ===== Helpers =====
    function mod(i, m){ return (i % m + m) % m; }
    function shortestDelta(a, b, m){
      a = mod(a, m); b = mod(b, m);
      var raw = b - a, alt = raw > 0 ? raw - m : raw + m;
      return Math.abs(raw) <= Math.abs(alt) ? raw : alt;
    }

    function callSetActiveDot(i){
      if (typeof setActiveDot === 'function') setActiveDot(i);
      else {
        // fallback: update aria-current if helper is not present
        var dots = carouselDots.children;
        for (var k = 0; k < dots.length; k++) {
          dots[k].setAttribute('aria-current', k === i ? 'true' : 'false');
        }
      }
    }

    // Measure the visible container width (more stable than 100vw/track width)
    function measure() {
      var base = (mobileCarouselEl && mobileCarouselEl.clientWidth) ||
                 (carouselTrack && carouselTrack.clientWidth) ||
                 window.innerWidth || 1;
      w = base;
    }

    function setTransition(on){
      carouselTrack.style.transition = on ? 'transform 320ms cubic-bezier(.22,.61,.36,1)' : 'none';
    }

    // Do not round — subpixel precision avoids drift on some DPRs
    function commitTransform(px){
      carouselTrack.style.transform = 'translate3d(' + px + 'px,0,0)';
    }

    // Compute logical indices for the 5-car window around center
    function computeWindow(center) {
      return [
        mod(center - 2, n),
        mod(center - 1, n),
        mod(center,     n),
        mod(center + 1, n),
        mod(center + 2, n)
      ];
    }

    // Mount cached images into cars per indices[]
    function renderCars() {
      var w5 = indices;

      var i0 = w5[0]; carPrev2.img.src = cache[i0].src; carPrev2.img.alt = 'Apartment photo ' + (i0 + 1);
      var i1 = w5[1]; carPrev1.img.src = cache[i1].src; carPrev1.img.alt = 'Apartment photo ' + (i1 + 1);

      var i2 = w5[2];
      carCurr.img.loading = 'eager'; // visible image loads immediately
      carCurr.img.src = cache[i2].src; carCurr.img.alt = 'Apartment photo ' + (i2 + 1);

      var i3 = w5[3]; carNext1.img.src = cache[i3].src; carNext1.img.alt = 'Apartment photo ' + (i3 + 1);
      var i4 = w5[4]; carNext2.img.src = cache[i4].src; carNext2.img.alt = 'Apartment photo ' + (i4 + 1);

      currentIndex = current;      // keep global in sync for fullscreen
      callSetActiveDot(current);
    }

    // Center (3rd car) WITHOUT animation, with reflow to lock-in
    function centerInstant() {
      setTransition(false);
      commitTransform(-2 * w);
      void carouselTrack.offsetHeight;      // force reflow
      requestAnimationFrame(function(){ setTransition(true); });
    }

    // Single animated step: dir = +1 (next) or -1 (prev)
    function step(dir){
      if (animating) return;
      animating = true;
      setTransition(true);
      commitTransform(-2 * w - dir * w);

      var onEnd = function(ev){
        if (ev && ev.propertyName && ev.propertyName !== 'transform') return;
        carouselTrack.removeEventListener('transitionend', onEnd);

        // Rearrange around new center silently
        setTransition(false);
        current = mod(current + dir, n);
        indices = computeWindow(current);
        renderCars();
        commitTransform(-2 * w);
        void carouselTrack.offsetHeight;
        requestAnimationFrame(function(){
          setTransition(true);
          animating = false;
        });
      };
      carouselTrack.addEventListener('transitionend', onEnd);
    }

    // Sequence of ±1 steps (for |delta|==2 we do two chained steps)
    function stepSequence(delta){
      if (delta === 0) return;
      var dir = delta > 0 ? +1 : -1;
      var count = Math.abs(delta);

      // Run first step; chain the rest on transitionend from step()
      function runNext(){
        if (count === 0) return;
        count--;
        var once = function(ev){
          if (ev && ev.propertyName && ev.propertyName !== 'transform') return;
          carouselTrack.removeEventListener('transitionend', once);
          if (count > 0) runNext();
        };
        carouselTrack.addEventListener('transitionend', once);
        step(dir);
      }
      if (!animating) runNext();
    }

    // Instant jump to arbitrary slide (no long multi-slide animation)
    function teleportTo(targetIdx){
      setTransition(false);
      current = mod(targetIdx, n);
      indices = computeWindow(current);
      renderCars();
      commitTransform(-2 * w);
      void carouselTrack.offsetHeight;
      requestAnimationFrame(function(){ setTransition(true); });
    }

    // ----- Pointer/Touch gestures (with duplicate-binding protection) -----
    // Remove old handlers if present (avoid duplicates on rebuilds)
    if (buildMobileCarouselOnce._handlers) {
      var H = buildMobileCarouselOnce._handlers;
      if (H.pointer && 'PointerEvent' in window) {
        carouselTrack.removeEventListener('pointerdown', H.pointer.down);
        carouselTrack.removeEventListener('pointermove', H.pointer.move);
        carouselTrack.removeEventListener('pointerup', H.pointer.up);
        carouselTrack.removeEventListener('pointercancel', H.pointer.up);
        carouselTrack.removeEventListener('lostpointercapture', H.pointer.up);
      }
      if (H.touch && !('PointerEvent' in window)) {
        carouselTrack.removeEventListener('touchstart', H.touch.start);
        carouselTrack.removeEventListener('touchmove',  H.touch.move);
        carouselTrack.removeEventListener('touchend',   H.touch.end);
        carouselTrack.removeEventListener('touchcancel',H.touch.end);
      }
    }
    buildMobileCarouselOnce._handlers = buildMobileCarouselOnce._handlers || {};

    // Pointer version
    if ('PointerEvent' in window) {
      var pd = function(e){
        if (animating || pointerId !== null) return;
        pointerId = e.pointerId || 'touch';
        dragging = true; setTransition(false);
        startX = e.clientX; dx = 0; startT = performance.now();
        if (carouselTrack.setPointerCapture && e.pointerId) {
          carouselTrack.setPointerCapture(e.pointerId);
        }
      };
      var pm = function(e){
        if (!dragging || (e.pointerId && e.pointerId !== pointerId)) return;
        dx = e.clientX - startX;
        commitTransform(-2 * w + dx);
      };
      var pu = function(e){
        if (!dragging || (e.pointerId && e.pointerId !== pointerId)) return;
        dragging = false; pointerId = null;

        var dt = Math.max(1, performance.now() - startT);
        var v = dx / dt;                 // px/ms
        var TH = Math.max(40, w * 0.15); // distance threshold
        var VEL = 0.5;                   // velocity threshold

        if (dx > TH || v >  VEL) step(-1);      // swipe right -> previous
        else if (dx < -TH || v < -VEL) step(+1);// swipe left  -> next
        else {
          setTransition(true);
          commitTransform(-2 * w);
          var once = function(ev){
            if (ev && ev.propertyName && ev.propertyName !== 'transform') return;
            carouselTrack.removeEventListener('transitionend', once);
            setTransition(false);
          };
          carouselTrack.addEventListener('transitionend', once);
        }
      };

      carouselTrack.addEventListener('pointerdown', pd);
      carouselTrack.addEventListener('pointermove', pm);
      carouselTrack.addEventListener('pointerup', pu);
      carouselTrack.addEventListener('pointercancel', pu);
      carouselTrack.addEventListener('lostpointercapture', pu);

      buildMobileCarouselOnce._handlers.pointer = { down: pd, move: pm, up: pu };
    } else {
      // Touch fallback
      var ts = function(e){
        if (!e.touches || !e.touches.length || animating) return;
        dragging = true; setTransition(false);
        startX = e.touches[0].clientX; dx = 0; startT = performance.now();
      };
      var tm = function(e){
        if (!dragging || !e.touches || !e.touches.length) return;
        dx = e.touches[0].clientX - startX;
        commitTransform(-2 * w + dx);
      };
      var te = function(){
        if (!dragging) return;
        dragging = false;
        var dt = Math.max(1, performance.now() - startT), v = dx/dt, TH = Math.max(40, w*0.15), VEL = 0.5;
        if (dx > TH || v >  0.5) step(-1);
        else if (dx < -TH || v < -0.5) step(+1);
        else { setTransition(true); commitTransform(-2 * w);
          var once=function(ev){ if(ev && ev.propertyName && ev.propertyName!=='transform')return;
            carouselTrack.removeEventListener('transitionend', once); setTransition(false); };
          carouselTrack.addEventListener('transitionend', once);
        }
      };

      carouselTrack.addEventListener('touchstart', ts, { passive: true });
      carouselTrack.addEventListener('touchmove',  tm, { passive: true });
      carouselTrack.addEventListener('touchend',   te, { passive: true });
      carouselTrack.addEventListener('touchcancel',te, { passive: true });

      buildMobileCarouselOnce._handlers.touch = { start: ts, move: tm, end: te };
    }

    // ----- Orientation/resize realign (bind once globally) -----
    function realignNow() {
      setTransition(false);
      measure();
      commitTransform(-2 * w);
      void carouselTrack.offsetHeight;
      requestAnimationFrame(function(){ setTransition(true); });
    }

    var _rlRAF = 0, _rlT1 = 0, _rlT2 = 0;
    function scheduleStableRealign(){
      if (_rlRAF) cancelAnimationFrame(_rlRAF);
      if (_rlT1)  clearTimeout(_rlT1);
      if (_rlT2)  clearTimeout(_rlT2);
      _rlRAF = requestAnimationFrame(realignNow); // immediate frame
      _rlT1  = setTimeout(realignNow, 120);       // after UI chrome adjusts
      _rlT2  = setTimeout(realignNow, 360);       // final settle (iOS toolbars)
    }

    if (!buildMobileCarouselOnce._viewportListenersBound) {
      window.addEventListener('resize',           scheduleStableRealign, { passive: true });
      window.addEventListener('orientationchange',scheduleStableRealign, { passive: true });
      if (window.visualViewport) {
        visualViewport.addEventListener('resize', scheduleStableRealign, { passive: true });
        visualViewport.addEventListener('scroll', scheduleStableRealign, { passive: true });
      }
      buildMobileCarouselOnce._viewportListenersBound = true;
    }

    // Expose realign hook for external callers
    buildMobileCarouselOnce._realign = scheduleStableRealign;

    // ----- Init window and center -----
    indices = computeWindow(current);
    renderCars();
    requestAnimationFrame(function(){
      measure();
      // ensure current visible image is eager for first paint
      carCurr.img.loading = 'eager';
      centerInstant();
    });
  }

  /* Back-compat: keep external realign hook */
  function realignMobileCarousel() {
    if (typeof buildMobileCarouselOnce._realign === 'function') {
      buildMobileCarouselOnce._realign();
    }
  }

  /* =================== Scroll locking helpers (fullscreen) =================== */
  function keepScrollLocked() {
    if (!overlay || !overlay.classList.contains('active')) return;
    window.scrollTo(0, _scrollY || 0);
  }

  // Allow pinch-zoom and multi-touch gestures; only block one-finger scroll
  function preventScroll(e) {
    if (!overlay || !overlay.classList.contains('active')) return;
    if (e.touches && e.touches.length > 1) return;
    e.preventDefault();
  }

  var _pinRAF = 0;
  function startScrollPinRAF() {
    if (_pinRAF) cancelAnimationFrame(_pinRAF);
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    function loop() {
      if (overlay && overlay.classList.contains('active')) {
        if ((window.scrollY|0) !== (_scrollY|0)) window.scrollTo(0, _scrollY || 0);
        _pinRAF = requestAnimationFrame(loop);
      } else {
        _pinRAF = 0;
      }
    }
    _pinRAF = requestAnimationFrame(loop);
  }
  function stopScrollPinRAF() {
    if (_pinRAF) cancelAnimationFrame(_pinRAF);
    _pinRAF = 0;
    if ('scrollRestoration' in history) history.scrollRestoration = 'auto';
  }

  /* =================== Fullscreen image setter (FADE) =================== */
  function setFsImage(idx) {
    if (!fsImage) return;
    idx = (idx + imageList.length) % imageList.length;
    var nextSrc = ORIG_DIR + imageList[idx];

    // Preload next image to avoid flashes
    var pre = new Image();
    pre.src = nextSrc;

    var apply = function () {
      // fade-out current
      fsImage.classList.remove('fs-fade-in');
      fsImage.classList.add('fs-fade-out');

      setTimeout(function () {
        // swap source mid-fade
        fsImage.src = nextSrc;

        // fade-in new
        fsImage.classList.remove('fs-fade-out');
        fsImage.classList.add('fs-fade-in');

        // cleanup
        setTimeout(function () {
          fsImage.classList.remove('fs-fade-in');
        }, FS_ANIM_MS + 20);
      }, FS_ANIM_MS);

      // sync state & thumbs
      currentIndex = idx;
      setActiveFsThumb(currentIndex);
      scrollFsThumbIntoView(currentIndex);
      resetThumbsBarAfterNavigation();
    };

    if (pre.decode) pre.decode().then(apply).catch(apply);
    else apply();
  }

  /* =================== Fullscreen (swipe-only; close only by X) =================== */
  function openFullscreen(index) {
    // Remember scroll
    _scrollY = window.scrollY || document.documentElement.scrollTop || 0;

    // Lock root scroll
    document.documentElement.classList.add('scroll-locked');
    document.body.style.position = 'fixed';
    document.body.style.top = '-' + _scrollY + 'px';
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';

    // Ensure overlay sits above any fixed headers
    if (overlay && overlay.parentNode !== document.body) {
      document.body.appendChild(overlay);
    }

    // Show overlay + image with fade
    switchMainTo(index); // keep desktop/mobile in sync
    setFsImage(index);
    if (overlay) {
      overlay.classList.add('active');
      overlay.setAttribute('tabindex', '-1');
      if (overlay.focus) overlay.focus({ preventScroll: true });
    }

    // Guards: hold scroll at _scrollY during viewport gymnastics
    window.addEventListener('scroll', keepScrollLocked, { passive: true });
    window.addEventListener('orientationchange', function () {
      setTimeout(keepScrollLocked, 0);
      setTimeout(keepScrollLocked, 250);
    }, { passive: true });
    if (window.visualViewport) {
      visualViewport.addEventListener('resize', keepScrollLocked, { passive: true });
    }
    document.addEventListener('touchmove', preventScroll, { passive: false });
    startScrollPinRAF();

    // Build/Show thumb strip and enable swipe
    buildFsThumbsOnce();
    setActiveFsThumb(currentIndex);
    scrollFsThumbIntoView(currentIndex);
    showFsThumbsBar({ manual: false });
    bindFsSwipe();
  }

  // --- Fullscreen close: stop guards, unlock scroll, restore exact position
  function closeFullscreen() {
    if (overlay) overlay.classList.remove("active");

    // stop guards
    window.removeEventListener("scroll", keepScrollLocked, { passive: true });
    if (window.visualViewport) {
      visualViewport.removeEventListener("resize", keepScrollLocked, { passive: true });
    }
    stopScrollPinRAF();

    // unlock scroll and restore position
    document.documentElement.classList.remove("scroll-locked");
    document.body.style.position = "";
    document.body.style.top = "";
    document.body.style.width = "";
    document.body.style.overflow = "";
    window.scrollTo(0, _scrollY || 0);

    // --- NEW: sync the main photo / mobile carousel with fullscreen index
    switchMainTo(currentIndex);
  }

  if (fsClose) fsClose.addEventListener('click', closeFullscreen);
  // IMPORTANT: no overlay click-to-close and no Escape-to-close (as requested)

  // Swipe handling (fsImage only; no arrow buttons in fullscreen)
  function bindFsSwipe() {
    if (!fsImage) return;
    var startX = 0;
    var endX = 0;
    var threshold = 50; // px

    fsImage.addEventListener('touchstart', function (e) {
      if (!e.changedTouches || !e.changedTouches.length) return;
      // Do not show thumbs here; allow pinch and single tap to do nothing
      startX = e.changedTouches[0].clientX;
    }, { passive: true });

    fsImage.addEventListener('touchmove', function () {
      // Do not show thumbs here either; keep UI calm during pinch/drag
    }, { passive: true });

    fsImage.addEventListener('touchend', function (e) {
      if (!e.changedTouches || !e.changedTouches.length) return;
      endX = e.changedTouches[0].clientX;
      var dx = endX - startX;

      if (Math.abs(dx) > threshold) {
        if (dx > 0) {
          // prev
          setFsImage((currentIndex - 1 + imageList.length) % imageList.length);
        } else {
          // next
          setFsImage((currentIndex + 1) % imageList.length);
        }
      }
    }, { passive: true });
  }


  function syncFullscreenVisuals() {
    // If overlay is open and main changed, keep fullscreen in sync (fade-less swap)
    if (overlay && overlay.classList.contains('active') && fsImage) {
      var targetSrc = ORIG_DIR + imageList[currentIndex];
      if (fsImage.src !== targetSrc) {
        fsImage.src = targetSrc;
      }
      setActiveFsThumb(currentIndex);
      scrollFsThumbIntoView(currentIndex);
    }
  }

  /* =================== Fullscreen thumbs strip (build once) =================== */
  function buildFsThumbsOnce() {
    if (!overlay) return;
    if (fsThumbsBar) return; // already built

    // Bar
    fsThumbsBar = document.createElement('div');
    fsThumbsBar.id = 'fs-thumbs'; // styled in CSS
    overlay.appendChild(fsThumbsBar);

    // Track
    fsThumbsTrack = document.createElement('div');
    fsThumbsTrack.id = 'fs-thumbs-track';
    fsThumbsBar.appendChild(fsThumbsTrack);

    // Thumbs
    for (var i = 0; i < imageList.length; i++) {
      (function (idx) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'fs-thumb';
        btn.setAttribute('aria-label', 'Slide ' + (idx + 1));

        var im = document.createElement('img');
        im.alt = 'Thumb ' + (idx + 1);
        im.loading = 'lazy';
        im.decoding = 'async';
        im.src = THUMB_DIR + imageList[idx];
        im.addEventListener('error', function () {
          im.src = ORIG_DIR + imageList[idx];
        });

        btn.appendChild(im);
        btn.addEventListener('click', function () {
          setFsImage(idx);
          showFsThumbsBar();
          scheduleHideFsThumbsBar();
        });

        fsThumbsTrack.appendChild(btn);
      })(i);
    }

    // Keep strip visible while interacting with it
    var keepVisible = function () { showFsThumbsBar(); };
    var hideLater   = function () { scheduleHideFsThumbsBar(); };
    fsThumbsBar.addEventListener('touchstart', keepVisible, { passive: true });
    fsThumbsBar.addEventListener('touchmove',  keepVisible, { passive: true });
    fsThumbsBar.addEventListener('touchend',   hideLater,   { passive: true });
    fsThumbsBar.addEventListener('wheel',      keepVisible, { passive: true });
    fsThumbsBar.addEventListener('scroll',     keepVisible, { passive: true });

    // Hide strip immediately when tapping overlay background (not image / not strip)
    overlay.addEventListener('click', function (e) {
      if (fsThumbsBar && !fsThumbsBar.contains(e.target) && e.target !== fsImage) {
        fsThumbsBar.classList.add('hidden');
        fsThumbsBar.classList.remove('visible');
        if (fsStripTimer) { clearTimeout(fsStripTimer); fsStripTimer = null; }
      }
    });

    // Initial sync
    setActiveFsThumb(currentIndex);
    scrollFsThumbIntoView(currentIndex);
  }

  function setActiveFsThumb(i) {
    if (!fsThumbsTrack) return;
    var btns = fsThumbsTrack.children;
    for (var k = 0; k < btns.length; k++) {
      if (k === i) {
        btns[k].classList.add('is-active');
        btns[k].setAttribute('aria-current', 'true');
      } else {
        btns[k].classList.remove('is-active');
        btns[k].removeAttribute('aria-current');
      }
    }
  }

  function scrollFsThumbIntoView(i) {
    if (!fsThumbsTrack) return;
    var btns = fsThumbsTrack.children;
    var el = btns[i];
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }

  function showFsThumbsBar() {
    if (!fsThumbsBar) return;
    fsThumbsBar.classList.add('visible');
    fsThumbsBar.classList.remove('hidden');
    if (overlay) overlay.classList.add('strip-visible'); // affects fs-image max-height
    if (fsStripTimer) {
      clearTimeout(fsStripTimer);
      fsStripTimer = null;
    }
  }

  function scheduleHideFsThumbsBar() {
    if (!fsThumbsBar) return;
    if (fsStripTimer) clearTimeout(fsStripTimer);
    fsStripTimer = setTimeout(function () {
      fsThumbsBar.classList.add('hidden');
      fsThumbsBar.classList.remove('visible');
      if (overlay) overlay.classList.remove('strip-visible');
    }, FS_STRIP_HIDE_DELAY);
  }

  /* ======= Toggle FS thumbs by double-tap (single-tap does nothing)  ======= */

  // Ensure thumbs bar exists before toggling (your project likely builds it lazily)
  function ensureFsThumbsBuilt() {
    if (!fsThumbsBar) {
      buildFsThumbsOnce(); // your existing builder should assign fsThumbsBar / fsThumbsTrack
    }
  }

  function hideFsThumbsBar() {
    if (!overlay || !fsThumbsBar) return;
    fsThumbsBar.classList.remove('visible');
    fsThumbsBar.classList.add('hidden');
    overlay.classList.remove('strip-visible');
    if (fsStripTimer) { clearTimeout(fsStripTimer); fsStripTimer = null; }
    overlay.dataset.fsManual = '0';
  }

  /** Show the thumbs bar and (re)start the auto-hide timer.
   *  opts.manual=true => keep visible longer (3.5s); false/omitted => 1.5s
   */
  function showFsThumbsBar(opts) {
    ensureFsThumbsBuilt();
    if (!overlay || !fsThumbsBar) return;

    var manual = !!(opts && opts.manual);
    var delay = manual ? FS_STRIP_HIDE_DELAY_MANUAL : FS_STRIP_HIDE_DELAY;

    fsThumbsBar.classList.add('visible');
    fsThumbsBar.classList.remove('hidden');
    overlay.classList.add('strip-visible');

    overlay.dataset.fsManual = manual ? '1' : '0';

    if (fsStripTimer) clearTimeout(fsStripTimer);
    fsStripTimer = setTimeout(hideFsThumbsBar, delay);
  }

  function toggleFsThumbsBar() {
    ensureFsThumbsBuilt();
    if (!overlay || !fsThumbsBar) return;
    var isVisible = fsThumbsBar.classList.contains('visible');
    if (isVisible) {
      hideFsThumbsBar();
    } else {
      showFsThumbsBar({ manual: true }); // manual => 3.5s
    }
  }

  /** After any navigation (swipe or click a thumb), return to default behavior:
   *  show (if hidden) and set auto-hide timer to 1.5s.
   */
  function resetThumbsBarAfterNavigation() {
    showFsThumbsBar({ manual: false });
  }

  (function enableFsDoubleTapToggle() {
    if (!fsImage) return;

    let lastTap = 0;
    const DBL_TAP_MS = 300;

    fsImage.addEventListener('click', function () {
      var now = Date.now();
      if (now - lastTap <= DBL_TAP_MS) {
        // Double-tap: toggle thumbs bar with manual timing (3.5s when shown)
        toggleFsThumbsBar();
        lastTap = 0;
      } else {
        lastTap = now;
        // Single tap: do nothing (keeps pinch-zoom available)
      }
    }, { passive: true });
  })();

  /* =================== Navigation (desktop buttons only) =================== */
  function prev() {
    var nextIdx = (currentIndex - 1 + imageList.length) % imageList.length;
    switchMainTo(nextIdx);
    if (mql.matches && slides[nextIdx]) {
      slides[nextIdx].scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    }
  }
  function next() {
    var nextIdx = (currentIndex + 1) % imageList.length;
    switchMainTo(nextIdx);
    if (mql.matches && slides[nextIdx]) {
      slides[nextIdx].scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    }
  }
  if (btnLeft)  btnLeft.addEventListener('click', prev);
  if (btnRight) btnRight.addEventListener('click', next);

  /* =================== Init =================== */
  if (mainImg) {
    mainImg.src = ORIG_DIR + imageList[0];
    currentIndex = 0;
  }

  buildMobileCarouselOnce();
  realignMobileCarousel();

  buildDesktopThumbsIfNeeded();

  if (mql.addEventListener) {
    mql.addEventListener('change', buildDesktopThumbsIfNeeded);
  } else if (mql.addListener) {
    mql.addListener(buildDesktopThumbsIfNeeded);
  }

  // Preload remaining originals
  for (var i = 1; i < imageList.length; i++) {
    var im = new Image();
    im.src = ORIG_DIR + imageList[i];
  }
});
