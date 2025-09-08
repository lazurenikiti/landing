// =====================================================
// HERO: background crossfade + typing/erasing caption
// - Captions are now taken from i18n and updated on the fly
//   when window.dispatchEvent(new CustomEvent('i18n:change'))
// =====================================================
(function initHero() {
  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  // --- universal getter for captions from different i18n objects ---
  function getI18nCaptions() {
    // Try common places where translations may be stored:
    // 1) window.I18N.get('captions') / window.I18N.t('captions')
    try {
      if (window.I18N) {
        if (typeof window.I18N.get === 'function') {
          const v = window.I18N.get('captions');
          if (Array.isArray(v) && v.length) return v;
        }
        if (typeof window.I18N.t === 'function') {
          const v = window.I18N.t('captions');
          if (Array.isArray(v) && v.length) return v;
        }
        if (Array.isArray(window.I18N.captions) && window.I18N.captions.length) {
          return window.I18N.captions;
        }
        if (window.I18N.current && Array.isArray(window.I18N.current.captions) && window.I18N.current.captions.length) {
          return window.I18N.current.captions;
        }
      }
    } catch (_) {}

    // 2) window.__i18n / window.__translations
    try {
      if (window.__i18n && Array.isArray(window.__i18n.captions) && window.__i18n.captions.length) {
        return window.__i18n.captions;
      }
      if (window.__translations && Array.isArray(window.__translations.captions) && window.__translations.captions.length) {
        return window.__translations.captions;
      }
    } catch (_) {}

    // 3) Fallback — English captions from the original code
    return [
      'Explore the Beauties of Sithonia.',
      'Stunning Views.',
      'Relax.',
      'Visit the Lazure Beaches.',
      'Feel the Greece.'
    ];
  }

  onReady(() => {
    // DOM targets (exit silently if not found)
    const bg1 = document.querySelector('.hero-background.bg1');
    const bg2 = document.querySelector('.hero-background.bg2');
    const captionEl = document.getElementById('hero-caption');
    if (!bg1 || !bg2 || !captionEl) return;

    // Backgrounds (unchanged)
    const backgrounds = [
      'images/hero/karidi.webp',
      'images/hero/halkidiki.webp',
      'images/hero/sunset.webp',
      'images/hero/platanitsi.webp',
      'images/hero/daisymeadow.webp'
    ];

    // Timer helpers, so we can restart cycle when language changes
    let timers = [];
    function clearTimers() {
      timers.forEach(clearTimeout);
      timers = [];
    }
    function later(fn, ms) {
      const id = setTimeout(fn, ms);
      timers.push(id);
      return id;
    }

    // Current state of the slider
    let state = {
      index: 0,
      active: true, // which background is active: true -> bg1, false -> bg2
      captions: getI18nCaptions()
    };

    // Initialize the first background
    function setFirstBackground() {
      bg1.style.backgroundImage = `url('${backgrounds[0]}')`;
      bg1.classList.add('active');
    }

    // Typing effect (add letters one by one)
    function typeText(text, done) {
      let i = 0;
      (function step() {
        if (i <= text.length) {
          captionEl.textContent = text.substring(0, i++);
          later(step, 60);
        } else if (typeof done === 'function') {
          done();
        }
      })();
    }

    // Erasing effect
    function eraseText(done) {
      const text = captionEl.textContent || '';
      let i = text.length;
      later(function step() {
        if (i >= 0) {
          captionEl.textContent = text.substring(0, i--);
          later(step, 30);
        } else if (typeof done === 'function') {
          done();
        }
      }, 500); // small pause before erasing
    }

    // Smooth background switch between two layers
    function changeBackground() {
      const nextIndex = (state.index + 1) % backgrounds.length;
      const incoming = state.active ? bg2 : bg1;
      const outgoing = state.active ? bg1 : bg2;

      incoming.style.backgroundImage = `url('${backgrounds[nextIndex]}')`;
      incoming.classList.add('active');
      outgoing.classList.remove('active');

      state.active = !state.active;
      state.index = nextIndex;
    }

    // Main cycle: type -> wait -> erase -> switch bg -> next caption
    function runCycle() {
      const caps = state.captions;
      if (!Array.isArray(caps) || caps.length === 0) return;

      const currentCaption = caps[state.index % caps.length] || '';
      typeText(currentCaption, () => {
        // keep the text on screen for a while
        later(() => {
          eraseText(() => {
            changeBackground();
            // next iteration
            later(runCycle, 200);
          });
        }, 5000);
      });
    }

    // Full restart (used when language changes)
    function restart(newCaptions) {
      clearTimers();
      captionEl.textContent = '';
      state.index = 0;
      state.active = true;
      state.captions = Array.isArray(newCaptions) && newCaptions.length ? newCaptions : getI18nCaptions();

      // Sync background to "first"
      bg1.classList.add('active');
      bg2.classList.remove('active');
      setFirstBackground();

      // Start cycle again
      runCycle();
    }

    // Initial run
    setFirstBackground();
    restart(state.captions);

    // Listen for language change — expected that i18n layer dispatches this event
    // window.dispatchEvent(new CustomEvent('i18n:change', { detail: { lang: 'de' } }));
    window.addEventListener('i18n:change', () => {
      const caps = getI18nCaptions();
      restart(caps);
    });
  });
})();
