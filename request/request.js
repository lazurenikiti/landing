// assets/js/contact.js
(function () {
  const form = document.getElementById('contact-form');
  if (!form) return;

  const sending = document.getElementById('cf-sending');
  const statusEl = document.getElementById('cf-status');
  const successBox = document.getElementById('contact-success');
  const honeypot = document.getElementById('cf-company') || (() => {
    const hp = document.createElement('input');
    hp.type = 'text'; hp.id = 'cf-company'; hp.name = 'company';
    hp.autocomplete = 'off'; hp.tabIndex = -1;
    hp.style.position = 'absolute'; hp.style.left = '-5000px';
    form.appendChild(hp);
    return hp;
  })();

  // Primary API and fallback (workers.dev)
  const PRIMARY_API = "https://api.lazure-nikiti.gr/request";
  const FALLBACK_API = "https://contact-form.ihnatovska-r.workers.dev/request";

  function isValidEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
  function setSending(on){ sending.hidden = !on; const btn=form.querySelector('button[type="submit"]'); if(btn) btn.disabled = on; }
  function abortAfter(ms){ const c=new AbortController(); const t=setTimeout(()=>c.abort(), ms); return {signal:c.signal, clear(){clearTimeout(t);} }; }

  async function sendOnce(url, payload){
    const ctrl = abortAfter(15000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload),
        signal: ctrl.signal
      });
      ctrl.clear();
      let data = {};
      try { data = await res.json(); } catch {}
      return { res, data };
    } catch (err) {
      ctrl.clear();
      throw err; // rethrow for fallback logic
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    statusEl.textContent = '';

    const name = document.getElementById('cf-name').value.trim();
    const email = document.getElementById('cf-email').value.trim();
    const message = document.getElementById('cf-message').value.trim();
    const company = honeypot.value.trim();

    if (!name || !isValidEmail(email) || message.length < 5) {
      statusEl.textContent = 'Please fill in all fields correctly.';
      return;
    }

    setSending(true);

    const payload = { name, email, message, company };

    try {
      // 1) Try primary API
      let { res, data } = await sendOnce(PRIMARY_API, payload);

      // 2) If primary failed for network reasons, try fallback
      if (!res || !('ok' in res) || res.status === 0) {
        throw new TypeError('Network failure on primary');
      }

      if (!res.ok) {
        // server answered with error — show details; fallback не нужен
        console.error('[request][primary][http-error]', res.status, data);
        statusEl.textContent = data.error || data.details || 'Failed to send. Please try again.';
      } else {
        // success
        form.reset();
        form.hidden = true;
        successBox.hidden = false;
        statusEl.textContent = '';
      }

    } catch (err) {
      console.warn('[request][primary][error]', err?.name, err?.message);

      // Only fallback on network-type errors (TypeError/Abort)
      if (err && (err.name === 'TypeError' || err.name === 'AbortError')) {
        try {
          const { res: r2, data: d2 } = await sendOnce(FALLBACK_API, payload);
          if (!r2.ok) {
            console.error('[request][fallback][http-error]', r2.status, d2);
            statusEl.textContent = d2.error || d2.details || 'Failed to send (fallback). Please try again.';
          } else {
            form.reset();
            form.hidden = true;
            successBox.hidden = false;
            statusEl.textContent = '';
          }
        } catch (err2) {
          console.error('[request][fallback][error]', err2?.name, err2?.message);
          statusEl.textContent = (err2 && err2.name === 'AbortError')
            ? 'Request timed out. Please try again.'
            : 'Network error. Please try again.';
        }
      } else {
        statusEl.textContent = 'Unexpected error. Please try again.';
      }
    } finally {
      setSending(false);
    }
  }

  form.addEventListener('submit', handleSubmit);
})();
