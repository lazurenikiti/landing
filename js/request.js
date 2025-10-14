(function () {
  const form = document.getElementById('contact-form');
  if (!form) return;

  const sending = document.getElementById('cf-sending');
  const successBox = document.getElementById('contact-success');

  const nameInput = document.getElementById('cf-name');
  const emailInput = document.getElementById('cf-email');
  const messageInput = document.getElementById('cf-message');

  const errName = document.getElementById('err-name');
  const errEmail = document.getElementById('err-email');
  const errMessage = document.getElementById('err-message');

  const API_URL = "https://api.lazure-nikiti.gr/request";

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function showError(input, errorEl, show) {
    errorEl.hidden = !show;
    if (show) {
      input.classList.add('error');
    } else {
      input.classList.remove('error');
    }
  }

  function validateFields() {
    let valid = true;

    if (!nameInput.value.trim()) {
      showError(nameInput, errName, true);
      valid = false;
    } else {
      showError(nameInput, errName, false);
    }

    if (!isValidEmail(emailInput.value.trim())) {
      showError(emailInput, errEmail, true);
      valid = false;
    } else {
      showError(emailInput, errEmail, false);
    }

    if (messageInput.value.trim().length < 5) {
      showError(messageInput, errMessage, true);
      valid = false;
    } else {
      showError(messageInput, errMessage, false);
    }

    return valid;
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (!validateFields()) return;

    sending.hidden = false;

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nameInput.value.trim(),
          email: emailInput.value.trim(),
          message: messageInput.value.trim(),
        })
      });

      const data = await res.json().catch(() => ({}));
      sending.hidden = true;

      if (res.ok) {
        form.reset();
        form.hidden = true;
        successBox.hidden = false;
      } else {
        console.error('[contact][error]', res.status, data);
        alert(data.error || 'Failed to send. Please try again.');
      }
    } catch (err) {
      sending.hidden = true;
      console.error('[contact][network]', err);
      alert('Network error. Please try again.');
    }
  }

  form.addEventListener('submit', handleSubmit);
})();
