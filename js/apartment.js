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

  /* ============== MOBILE (native scroll-snap + infinite via 2 clones) ============== */

  /* Safe placeholder so calls before init won't break */
  function realignMobileCarousel(){}

  function buildMobileCarousel() {
    if (!carouselTrack || !carouselDots) return;

    // Reset DOM
    carouselTrack.innerHTML = '';
    carouselDots.innerHTML  = '';

    var n = imageList.length;
    if (!n) return;

    var viewport = document.getElementById('mobile-carousel') || carouselTrack.parentNode;

    /* ---- SWIPE TUNING ---- */
    var DEAD_PX      = 4;     // pixels to ignore before deciding gesture intent
    var INTENT_RATIO = 1.1;   // horizontal if |dx| > |dy| * ratio
    var SWIPE_FRAC   = 0.08;  // fraction of width for a "slow swipe"
    var SWIPE_MIN    = 4;    // minimum px for a swipe
    var FLICK_VEL    = 0.25;  // velocity threshold (px/ms) for a "flick"
    var PREDICT_MS   = 140;   // lookahead window for velocity projection
    var EARLY_FRAC   = 0.25;  // early trigger if dragged this fraction of width
    var MAX_DRAG_FR  = 0.95;  // max drag distance before resistance

    // Build 3 reusable slides: [prev | current | next]
    function makeSlide() {
      var s = document.createElement('div');
      s.className = 'slide';
      var img = document.createElement('img');
      img.decoding = 'async';
      img.loading = 'lazy';
      s.appendChild(img);
      return { el: s, img: img };
    }
    var Sprev = makeSlide(), Scurr = makeSlide(), Snext = makeSlide();
    Scurr.img.loading = 'eager'; // preload current
    carouselTrack.appendChild(Sprev.el);
    carouselTrack.appendChild(Scurr.el);
    carouselTrack.appendChild(Snext.el);

    // State
    var cur = (typeof currentIndex === 'number' ? currentIndex : 0) % n;
    var w   = () => (viewport && viewport.clientWidth) || window.innerWidth || 1;
    var anim = false;

    // Helpers
    function idx(i){ return (i % n + n) % n; }   // safe modulo
    function srcAt(i){ return ORIG_DIR + imageList[idx(i)]; }

    function setTransition(on){ carouselTrack.style.transition = on ? 'transform 240ms cubic-bezier(.22,.61,.36,1)' : 'none'; }
    function setX(px){ carouselTrack.style.transform = 'translate3d(' + px + 'px,0,0)'; }

    function paintDots(){
      var ds = carouselDots.children;
      for (var j=0;j<ds.length;j++){
        if (j===cur) ds[j].setAttribute('aria-current','true');
        else ds[j].removeAttribute('aria-current');
      }
    }

    // Render the three slides based on current index
    function renderTriplet() {
      Sprev.img.src = srcAt(cur - 1);
      Scurr.img.src = srcAt(cur);
      Snext.img.src = srcAt(cur + 1);

      setTransition(false);
      setX(-w()); // keep current centered

      // Preload two neighbors ahead/behind
      var pre1 = new Image(); pre1.src = srcAt(cur + 2);
      var pre2 = new Image(); pre2.src = srcAt(cur - 2);

      paintDots();
      currentIndex = cur;
    }

    // Build dots
    for (var i=0;i<n;i++){
      (function(di){
        var b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('aria-label','Slide '+(di+1));
        b.addEventListener('click', function(){
          if (anim || di===cur) return;
          if (di === idx(cur+1)) step(+1);
          else if (di === idx(cur-1)) step(-1);
          else { cur = di; renderTriplet(); } // jump instantly if far
        });
        carouselDots.appendChild(b);
      })(i);
    }

    // Animate one step left/right
    function step(dir){
      if (anim) return; anim = true;
      setTransition(true);
      setX(dir > 0 ? -2*w() : 0);
      var onEnd = function(e){
        if (e && e.propertyName && e.propertyName!=='transform') return;
        carouselTrack.removeEventListener('transitionend', onEnd);
        cur = idx(cur + (dir>0 ? +1 : -1));
        renderTriplet(); // reset silently
        requestAnimationFrame(function(){ setTransition(true); anim = false; });
      };
      carouselTrack.addEventListener('transitionend', onEnd);
    }

    // Tap current slide to open fullscreen
    Scurr.img.addEventListener('click', function(){ openFullscreen(cur); }, false);

    /* ---- GESTURES ----
       - Vertical scroll of the page always passes through
       - Horizontal swipe only when clearly detected
    */
    var dragging=false, decided=false, horizontal=false;
    var sx=0, sy=0, dx=0, startX=0, t0=0;

    function onDown(x,y){
      if (anim) return;
      dragging=true; decided=false; horizontal=false;
      sx=x; sy=y; dx=0; startX=-w(); t0 = (performance && performance.now()) || Date.now();
      setTransition(false);
    }
    function onMove(x,y,ev){
      if (!dragging) return;
      var adx = x - sx, ady = y - sy;

      if (!decided) {
        var absx = Math.abs(adx), absy = Math.abs(ady);
        if (absx > DEAD_PX || absy > DEAD_PX) {
          if (absx > absy * INTENT_RATIO) { decided=true; horizontal=true; }
          else if (absy > absx) { decided=true; horizontal=false; }
        }
      }

      if (decided && horizontal) {
        if (ev && ev.cancelable) ev.preventDefault(); // block only for horizontal drags
        dx = adx;

        // Apply resistance if dragging further than ~1 screen
        var cap = w()*MAX_DRAG_FR;
        if (dx >  cap) dx =  cap - (dx-cap)*0.25;
        if (dx < -cap) dx = -cap - (dx+cap)*0.25;

        setX(startX + dx);

        // Early trigger when dragged more than EARLY_FRAC of width
        var early = w()*EARLY_FRAC;
        if (dx <= -early) { dragging=false; step(+1); }
        else if (dx >=  early) { dragging=false; step(-1); }
      }
    }
    function onUp(){
      if (!dragging) return;
      dragging=false;

      if (!horizontal) { setTransition(true); setX(-w()); return; }

      var dt = Math.max(1, ((performance && performance.now()) || Date.now()) - t0);
      var v = dx / dt; // velocity in px/ms
      var threshold = Math.max(SWIPE_MIN, w()*SWIPE_FRAC);

      // Project movement based on velocity (predict finger continuation)
      var projected = dx + v * PREDICT_MS;

      if (projected <= -threshold || v < -FLICK_VEL) step(+1);   // swipe left -> next
      else if (projected >=  threshold || v >  FLICK_VEL) step(-1); // swipe right -> prev
      else { setTransition(true); setX(-w()); } // snap back
    }

    // Pointer events (modern) or Touch fallback
    if (window.PointerEvent) {
      carouselTrack.addEventListener('pointerdown', function(e){
        onDown(e.clientX, e.clientY);
        if (carouselTrack.setPointerCapture && e.pointerId!=null) carouselTrack.setPointerCapture(e.pointerId);
      }, { passive: true });
      carouselTrack.addEventListener('pointermove', function(e){ onMove(e.clientX, e.clientY, e); }, { passive: false });
      ['pointerup','pointercancel','lostpointercapture'].forEach(function(t){
        carouselTrack.addEventListener(t, onUp, { passive: true });
      });
    } else {
      carouselTrack.addEventListener('touchstart', function(e){
        if (!e.touches || !e.touches.length) return;
        var t=e.touches[0]; onDown(t.clientX, t.clientY);
      }, { passive: true });
      carouselTrack.addEventListener('touchmove', function(e){
        if (!e.touches || !e.touches.length) return;
        var t=e.touches[0]; onMove(t.clientX, t.clientY, e);
      }, { passive: false });
      carouselTrack.addEventListener('touchend', onUp, { passive: true });
      carouselTrack.addEventListener('touchcancel', onUp, { passive: true });
    }

    // External controls (optional)
    buildMobileCarousel._next = function(){ if (!anim) step(+1); };
    buildMobileCarousel._prev = function(){ if (!anim) step(-1); };

    // Realign on resize/orientation
    function realign(){
      setTransition(false);
      setX(-w());
      requestAnimationFrame(function(){ setTransition(true); });
    }
    realignMobileCarousel = realign;

    // Initial render
    renderTriplet();
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
