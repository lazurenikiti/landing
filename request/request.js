// assets/js/contact.js
(function () {
  const form = document.getElementById('contact-form');
  if (!form) return;

  const sending = document.getElementById('cf-sending');
  const statusEl = document.getElementById('cf-status');
  const successBox = document.getElementById('contact-success');
  const block = document.getElementById('contact-form-block');

  // Honeypot field (hidden, anti-bot)
  let honeypot = document.getElementById('cf-company');
  if (!honeypot) {
    honeypot = document.createElement('input');
    honeypot.type = 'text';
    honeypot.id = 'cf-company';
    honeypot.name = 'company';
    honeypot.autocomplete = 'off';
    honeypot.tabIndex = -1;
    honeypot.style.position = 'absolute';
    honeypot.style.left = '-5000px';
    form.appendChild(honeypot);
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  async function handleSubmit(e) {
    e.preventDefault();

    const name = document.getElementById('cf-name').value.trim();
    const email = document.getElementById('cf-email').value.trim();
    const message = document.getElementById('cf-message').value.trim();
    const company = honeypot.value.trim();

    // Simple client-side validation
    if (!name || !isValidEmail(email) || message.length < 5) {
      statusEl.textContent = 'Please fill in all fields correctly.';
      return;
    }

    sending.hidden = false;
    statusEl.textContent = '';

    try {
      const res = await fetch('https://lazure-nikiti.gr/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, message, company })
      });

      const data = await res.json().catch(() => ({}));
      sending.hidden = true;

      if (res.ok) {
        form.reset();
        form.hidden = true;
        successBox.hidden = false;
      } else {
        statusEl.textContent = data.error || 'Failed to send. Please try again.';
      }
    } catch (err) {
      sending.hidden = true;
      statusEl.textContent = 'Network error. Please try again.';
    }
  }

  form.addEventListener('submit', handleSubmit);
})();
