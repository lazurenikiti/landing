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
    'Pool_map.jpg','Inner_1_map.jpg','Inner_2_map.jpg','Inner_3_map.jpg',
    'Inner_4_map.jpg','Inner_5_map.jpg','Kitchen_1_map.jpg','Kitchen_2_map.jpg',
    'Bath_map.jpg','Garden_map.jpg','Outer_map.jpg','Playground_map.jpg'
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

  /* ============== MOBILE CAROUSEL ============== */

  // Public hook for resize/orientation
  function realignMobileCarousel() {}

  // Main init
  function buildMobileCarousel() {
    if (!carouselTrack || !carouselDots) return;

    // We do NOT rely on native horizontal scroll anymore.
    // We position 2 absolutely stacked slides and animate with transforms.

    var viewport = document.getElementById('mobile-carousel') || carouselTrack.parentNode;
    if (!viewport) return;

    var n = imageList.length;
    if (!n) return;

    // ---------- Utilities ----------
    function norm(i) { return ((i % n) + n) % n; }

    function paintDots(active) {
      carouselDots.innerHTML = '';
      for (var i = 0; i < n; i++) {
        (function (idx) {
          var b = document.createElement('button');
          b.type = 'button';
          b.setAttribute('aria-label', 'Slide ' + (idx + 1));
          if (idx === active) b.setAttribute('aria-current', 'true');
          b.addEventListener('click', function () { goTo(idx); });
          carouselDots.appendChild(b);
        })(i);
      }
    }

    function makeLayer() {
      // Each layer is a slide with an <img>, absolutely positioned to fill viewport.
      var s = document.createElement('div');
      s.className = 'slide mc-layer';
      var img = document.createElement('img');
      img.decoding = 'async';
      img.loading = 'lazy';
      img.draggable = false;
      img.addEventListener('click', function () {
        if (typeof openFullscreen === 'function') openFullscreen(currentIndex);
      }, false);
      s.appendChild(img);
      return s;
    }

    function setLayerImage(layerEl, idx, { hideUntilReady } = { hideUntilReady: false }) {
      idx = norm(idx);
      layerEl.dataset.idx = String(idx);
      var img = layerEl.querySelector('img');
      var src = ORIG_DIR + imageList[idx];

      // If we want transparent neighbor until ready: keep it invisible until loaded.
      if (hideUntilReady) {
        img.style.visibility = 'hidden';
        preloadIndex(idx).then(function (res) {
          // If layer still points to the same index, update and reveal
          if (String(idx) === layerEl.dataset.idx) {
            img.src = res.src;
            img.style.visibility = 'visible';
          }
        });
      } else {
        if (img.src !== src) img.src = src;
      }
    }

    function preloadIndex(idx) {
      return new Promise(function (resolve) {
        idx = norm(idx);
        var src = ORIG_DIR + imageList[idx];
        var im = new Image();
        im.src = src;
        var done = function () { resolve({ idx: idx, src: src }); };
        if (im.decode) im.decode().then(done).catch(done);
        else im.onload = done;
      });
    }

    function setTransform(el, px) {
      el.style.transform = 'translateX(' + px + 'px)';
    }

    function enableTransition(el) {
      el.style.transition = 'transform 280ms cubic-bezier(.22,.61,.36,1)';
    }
    function disableTransition(el) {
      el.style.transition = 'none';
    }

    function viewportWidth() {
      return viewport.clientWidth || window.innerWidth || 1;
    }

    // ---------- DOM: 2 layers only ----------
    carouselTrack.innerHTML = ''; // reuse track as a stacking context
    carouselTrack.classList.add('mc-stack'); // CSS will make it relative/overflow-hidden

    var layerA = makeLayer(); // current
    var layerB = makeLayer(); // neighbor (appears from left/right)
    carouselTrack.appendChild(layerA);
    carouselTrack.appendChild(layerB);

    // ---------- State ----------
    var W = viewportWidth();
    var startX = 0;
    var lastX = 0;
    var lastT = 0;
    var velocityX = 0;
    var dragging = false;
    var dir = 0;          // -1 prev, +1 next, 0 none
    var neighborIdx = 0;  // which index belongs to neighbor layer
    var committing = false;

    // Initialize current slide
    setLayerImage(layerA, currentIndex, { hideUntilReady: false });
    setTransform(layerA, 0);
    disableTransition(layerA);

    // Hide neighbor offscreen initially
    setTransform(layerB, W); // arbitrary offscreen; will be repositioned on swipe
    disableTransition(layerB);

    paintDots(currentIndex);

    // ---------- Resize ----------
    var ro = new ResizeObserver(function () {
      W = viewportWidth();
      // Keep current layer at 0; reposition neighbor offscreen based on dir
      setTransform(layerA, 0);
      if (dir === 0) {
        setTransform(layerB, W); // parked offscreen right
      } else if (dir > 0) {
        setTransform(layerB, W);
      } else {
        setTransform(layerB, -W);
      }
    });
    ro.observe(viewport);

    // ---------- Gesture handling (touch + mouse) ----------
    // For iOS-like feel we prevent horizontal page scroll during drag:
    viewport.style.touchAction = 'pan-y pinch-zoom';

    function onDown(clientX) {
      if (committing) return; // ignore if animating
      dragging = true;
      startX = lastX = clientX;
      lastT = performance.now();
      dir = 0;
      disableTransition(layerA);
      disableTransition(layerB);
    }

    function onMove(clientX) {
      if (!dragging) return;
      var now = performance.now();
      var dx = clientX - lastX;
      var dt = Math.max(1, now - lastT);
      velocityX = dx / dt; // px/ms
      lastX = clientX;
      lastT = now;

      var totalDx = clientX - startX;

      // Lock direction once user actually moves
      if (dir === 0 && Math.abs(totalDx) > 6) {
        dir = totalDx < 0 ? +1 : -1; // left drag => next; right drag => prev

        // Prepare neighbor layer offscreen and transparent until loaded
        neighborIdx = norm(currentIndex + (dir > 0 ? +1 : -1));
        setLayerImage(layerB, neighborIdx, { hideUntilReady: true });

        if (dir > 0) setTransform(layerB, W);   // to the right
        else setTransform(layerB, -W);          // to the left
      }

      if (dir !== 0) {
        // Drag current and neighbor together
        var curX = totalDx;
        var nbX  = (dir > 0 ? W : -W) + totalDx;

        setTransform(layerA, curX);
        setTransform(layerB, nbX);
      }
    }

    function onUp() {
      if (!dragging) return;
      dragging = false;

      if (dir === 0) {
        // Not enough movement: snap back (already at 0)
        enableTransition(layerA);
        setTransform(layerA, 0);
        // park neighbor
        enableTransition(layerB);
        setTransform(layerB, dir > 0 ? W : -W);
        setTimeout(() => {
          disableTransition(layerA);
          disableTransition(layerB);
        }, 300);
        return;
      }

      // Decide commit using distance OR fling velocity
      var endDelta = lastX - startX;
      var distanceCommit = Math.abs(endDelta) > W * 0.28;
      var velocityCommit = Math.abs(velocityX) > 0.6; // ~0.6 px/ms ≈ quick flick
      var commit = distanceCommit || velocityCommit;

      enableTransition(layerA);
      enableTransition(layerB);

      if (commit) {
        committing = true;
        // Finish swipe: current moves out, neighbor moves to 0
        setTransform(layerA, dir > 0 ? -W : W);
        setTransform(layerB, 0);

        // When transition ends, swap roles
        var done = function () {
          layerA.removeEventListener('transitionend', done);
          // A becomes the new current content at 0; B is parked offscreen for later reuse
          // Swap DOM roles by swapping references to keep order
          var tmp = layerA; layerA = layerB; layerB = tmp;

          currentIndex = neighborIdx;
          paintDots(currentIndex);

          // Park the (new) neighbor layer offscreen and clear its transform
          disableTransition(layerB);
          setTransform(layerB, dir > 0 ? W : -W);

          // Reset state
          dir = 0;
          committing = false;
        };
        layerA.addEventListener('transitionend', done);
      } else {
        // Cancel swipe: return both to their initial positions
        setTransform(layerA, 0);
        setTransform(layerB, dir > 0 ? W : -W);
        setTimeout(() => {
          disableTransition(layerA);
          disableTransition(layerB);
          dir = 0;
        }, 300);
      }
    }

    // Touch
    viewport.addEventListener('touchstart', function (e) {
      if (!e.changedTouches || !e.changedTouches.length) return;
      onDown(e.changedTouches[0].clientX);
    }, { passive: true });

    viewport.addEventListener('touchmove', function (e) {
      if (!e.changedTouches || !e.changedTouches.length) return;
      onMove(e.changedTouches[0].clientX);
      // We do not preventDefault to keep pinch; touch-action limits horizontal page scroll.
    }, { passive: true });

    viewport.addEventListener('touchend', function () { onUp(); }, { passive: true });
    viewport.addEventListener('touchcancel', function () { onUp(); }, { passive: true });

    // Mouse (optional — helpful for testing on desktop)
    viewport.addEventListener('mousedown', function (e) { onDown(e.clientX); });
    window.addEventListener('mousemove', function (e) { onMove(e.clientX); });
    window.addEventListener('mouseup', function () { onUp(); });

    // ---------- API ----------
    function next() {
      if (committing) return;
      dir = +1;
      neighborIdx = norm(currentIndex + 1);
      // Prepare neighbor
      setLayerImage(layerB, neighborIdx, { hideUntilReady: true });
      disableTransition(layerA); disableTransition(layerB);
      setTransform(layerA, 0);
      setTransform(layerB, W);
      // Animate
      requestAnimationFrame(function () {
        enableTransition(layerA); enableTransition(layerB);
        setTransform(layerA, -W);
        setTransform(layerB, 0);
        // finalize as in commit
        var done = function () {
          layerA.removeEventListener('transitionend', done);
          var tmp = layerA; layerA = layerB; layerB = tmp;
          currentIndex = neighborIdx;
          paintDots(currentIndex);
          disableTransition(layerB);
          setTransform(layerB, W);
          dir = 0;
        };
        layerA.addEventListener('transitionend', done);
      });
    }

    function prev() {
      if (committing) return;
      dir = -1;
      neighborIdx = norm(currentIndex - 1);
      setLayerImage(layerB, neighborIdx, { hideUntilReady: true });
      disableTransition(layerA); disableTransition(layerB);
      setTransform(layerA, 0);
      setTransform(layerB, -W);
      requestAnimationFrame(function () {
        enableTransition(layerA); enableTransition(layerB);
        setTransform(layerA, W);
        setTransform(layerB, 0);
        var done = function () {
          layerA.removeEventListener('transitionend', done);
          var tmp = layerA; layerA = layerB; layerB = tmp;
          currentIndex = neighborIdx;
          paintDots(currentIndex);
          disableTransition(layerB);
          setTransform(layerB, -W);
          dir = 0;
        };
        layerA.addEventListener('transitionend', done);
      });
    }

    function goTo(target) {
      target = norm(target);
      if (target === currentIndex) return;
      // If target is adjacent, animate swipe; otherwise do a quick crossfade-like swap.
      var delta = target - currentIndex;
      if (Math.abs(delta) === 1 || Math.abs(delta) === n - 1) {
        // Adjacent — choose direction that matches ring
        if ((delta === 1) || (delta === -(n - 1))) next();
        else prev();
        return;
      }
      // Non-adjacent: instant swap without swipe (no transforms fight)
      disableTransition(layerA); disableTransition(layerB);
      setLayerImage(layerA, target, { hideUntilReady: false });
      setTransform(layerA, 0);
      setTransform(layerB, W);
      currentIndex = target;
      paintDots(currentIndex);
      dir = 0;
    }

    buildMobileCarousel._next = next;
    buildMobileCarousel._prev = prev;
    buildMobileCarousel.goTo  = goTo;

    // Optional keyboard
    viewport.setAttribute('tabindex', '0');
    viewport.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
    });

    return { next, prev, goTo, get index(){ return currentIndex; } };
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

  buildMobileCarousel();

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
