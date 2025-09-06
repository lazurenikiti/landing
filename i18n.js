// i18n.js — lightweight runtime for translations & title images

(function () {
  // ---- Language registry: codes, flag file, title folder, json file ----
  const LANGS = [
    // code  label  flag file       titles folder  json file
    { code: 'en', label: 'EN', flag: 'en.webp', folder: 'en', json: 'en.json' },
    { code: 'ua', label: 'UA', flag: 'ua.webp', folder: 'ua', json: 'ua.json' },
    { code: 'de', label: 'DE', flag: 'de.webp', folder: 'de', json: 'de.json' },
    { code: 'el', label: 'EL', flag: 'gr.webp', folder: 'gr', json: 'gr.json' },
    { code: 'tr', label: 'TR', flag: 'tr.webp', folder: 'tr', json: 'tr.json' },
    { code: 'sr', label: 'SR', flag: 'sr.webp', folder: 'sr', json: 'sr.json' },
    { code: 'bg', label: 'BG', flag: 'bg.webp', folder: 'bg', json: 'bg.json' }
  ];

  // ---- Paths ----
  const PATHS = {
    flags: 'images/general/flags/',
    titlesBase: 'images/general/titels/', // as per your structure
    i18n: 'i18n/'
  };

  // ---- Title images to swap per language ----
  const TITLE_TARGETS = [
    { id: 'apartment', slug: 'apartment.webp', keyAlt: 'titles.apartment.text' },
    { id: 'amenities', slug: 'amenities.webp', keyAlt: 'titles.amenities.text' },
    { id: 'essential', slug: 'essential.webp', keyAlt: 'titles.essential.text' },
    { id: 'policies',  slug: 'policies.webp',  keyAlt: 'titles.policies.text'  },
    { id: 'location',  slug: 'location.webp',  keyAlt: 'titles.location.text'  },
    { id: 'contact',   slug: 'contact.webp',   keyAlt: 'titles.contact.text'   }
  ];

  // ---- Shortcuts ----
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ---- Language detection & persistence ----
  function getLangFromUrl() {
    const m = location.search.match(/[?&]lang=([a-z]{2})/i);
    return m ? m[1].toLowerCase() : null;
  }
  function getDefaultLang() {
    const nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
    return LANGS.some(l => l.code === nav) ? nav : 'en';
  }
  function getCurrentLang() {
    return getLangFromUrl() || localStorage.getItem('lang') || getDefaultLang();
  }
  function setUrlLang(code) {
    const url = new URL(location.href);
    url.searchParams.set('lang', code);
    history.replaceState(null, '', url.toString());
  }

    // ---- Fetch dictionary ----
  async function loadDict(code) {
    const meta = LANGS.find(l => l.code === code) || LANGS[0];
    const url = PATHS.i18n + meta.json;
    let res;
    try {
      res = await fetch(url, { cache: 'no-cache' });
    } catch (e) {
      throw new Error(`i18n network error: ${url} :: ${e && e.message}`);
    }
    if (!res.ok) {
      throw new Error(`i18n HTTP ${res.status} for ${url}`);
    }
    try {
      return await res.json();
    } catch (e) {
      throw new Error(`i18n JSON parse error for ${url}: ${e && e.message}`);
    }
  }

  // ---- Dotted path getter (e.g., get(dict, "nav.menu.apartment")) ----
  function get(obj, dottedKey) {
    return dottedKey.split('.').reduce((a, k) => (a && a[k] != null ? a[k] : undefined), obj);
  }

  // ---- Apply translations to DOM ----
  function applyTranslations(dict, currentLang) {
    // Text nodes
    $$('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const val = get(dict, key);
      if (val == null) return;
    
      if (Array.isArray(val) && (el.tagName === 'UL' || el.tagName === 'OL')) {
        el.innerHTML = '';
        val.forEach(item => {
          const li = document.createElement('li');
          li.textContent = String(item);
          el.appendChild(li);
        });
        return;
      }
      
      el.textContent = Array.isArray(val) ? val.join(' ') : String(val);
    });

    // Attributes
    $$('[data-i18n-attr]').forEach(el => {
      const pairs = el.getAttribute('data-i18n-attr')
        .split(';').map(s => s.trim()).filter(Boolean);
      pairs.forEach(p => {
        const [attr, key] = p.split(':').map(s => s.trim());
        if (!attr || !key) return;
        const val = get(dict, key);
        if (val != null) el.setAttribute(attr, String(val));
      });
    });

    // <title>
    const title = get(dict, 'meta.title');
    if (title) document.title = title;

    // Always dispatch the event; if captions are missing, use an empty array
    const captions = Array.isArray(dict.hero?.captions) ? dict.hero.captions : [];
    window.__i18n = Object.assign({}, window.__i18n || {}, { captions, lang: currentLang });
    window.dispatchEvent(new CustomEvent('i18n:change', { detail: { lang: currentLang, captions } }));
  }

  // ---- Swap language-specific title images ----
  function applyTitleImages(langMeta, dict) {
    const folder = langMeta.folder; // например: "en", "de", ...
    const altKeyById = {
      apartment: 'apartment.title.img.alt',
      amenities: 'amenities.title.img.alt',
      essential: 'amenities.subtitle.essential.img.alt',
      policies:  'policies.title.img.alt',
      location:  'location.title.img.alt',
      contact:   'contact.title.img.alt'
    };
  
    (TITLE_TARGETS || []).forEach(t => {
      const img = document.getElementById(t.id);
      if (!img) return;
      img.src = PATHS.titlesBase + folder + '/' + t.slug;
      const key = altKeyById[t.id];
      if (!key) return;
      const alt = get(dict, key);
      if (alt != null) img.alt = String(alt);
    });
  }

  // ---- Build UI: desktop dropdown & mobile grid ----
  function buildUI(currentLang) {
    // Desktop dropdown
    const desktop = $('#lang-switcher-desktop');
    if (desktop) {
      const btn  = desktop.querySelector('.lang-btn');
      const list = desktop.querySelector('.lang-list');
      if (list) {
        list.innerHTML = '';
        LANGS.forEach(l => {
          const li = document.createElement('li');
          li.setAttribute('role', 'option');
          li.setAttribute('data-lang', l.code);
          li.innerHTML = `<img class="flag" src="${PATHS.flags + l.flag}" alt="${l.label} flag"><span>${l.label}</span>`;
          list.appendChild(li);
        });

        // Current state visuals
        const meta = LANGS.find(l => l.code === currentLang) || LANGS[0];
        if (btn) {
          btn.querySelector('.flag').src = PATHS.flags + meta.flag;
          btn.querySelector('.lang-code').textContent = meta.label;

          btn.addEventListener('click', () => {
            const open = desktop.classList.toggle('open');
            btn.setAttribute('aria-expanded', open ? 'true' : 'false');
          });

          // Pick language
          list.addEventListener('click', (e) => {
            const li = e.target.closest('li[data-lang]');
            if (!li) return;
            setLanguage(li.getAttribute('data-lang'), true);
            desktop.classList.remove('open');
            btn.setAttribute('aria-expanded', 'false');
          });

          // Close on outside click
          document.addEventListener('click', (e) => {
            if (!desktop.contains(e.target)) {
              desktop.classList.remove('open');
              btn.setAttribute('aria-expanded', 'false');
            }
          });
        }
      }
    }

    // Mobile grid
    const grid = $('#lang-switcher-mobile .lang-grid');
    if (grid) {
      grid.innerHTML = '';
      LANGS.forEach(l => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'lang-item' + (l.code === currentLang ? ' active' : '');
        item.setAttribute('data-lang', l.code);
        item.setAttribute('role', 'option');
        item.innerHTML = `<img class="flag" src="${PATHS.flags + l.flag}" alt="${l.label} flag"><span>${l.label}</span>`;
        grid.appendChild(item);
      });
      grid.addEventListener('click', (e) => {
        const btn = e.target.closest('.lang-item[data-lang]');
        if (!btn) return;
        setLanguage(btn.getAttribute('data-lang'), true);
      });
    }
  }

  // ---- Core: change language ----
  let currentLang = getCurrentLang();

  async function setLanguage(code, userAction = false) {
    const meta = LANGS.find(l => l.code === code) || LANGS[0];
    try {
      const dict = await loadDict(meta.code);
      applyTranslations(dict, meta.code);
      applyTitleImages(meta, dict);
      currentLang = meta.code;
      localStorage.setItem('lang', currentLang);
      setUrlLang(currentLang);
      buildUI(currentLang);
    } catch (err) {
      console.error('[i18n] Failed to load language:', err);

      if (meta.code !== 'en') {
        try {
          const enDict = await loadDict('en');
          applyTranslations(enDict, 'en');
          applyTitleImages(LANGS.find(l => l.code === 'en'), enDict);
          currentLang = 'en';
          localStorage.setItem('lang', currentLang);
          setUrlLang(currentLang);
          buildUI(currentLang);
        } catch (err2) {
          console.error('[i18n] Fallback EN failed:', err2);
        }
      }
      if (userAction) {
        alert(String(err.message || err));
      }
    }
  }

  // ---- Init ----
  function init() {
    buildUI(currentLang);
    setLanguage(currentLang, false);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  window.addEventListener('load', () => {
    setLanguage(localStorage.getItem('lang') || currentLang, false);
  });

  // ---- Optional global access ----
  window.setLanguage = setLanguage;
})();
