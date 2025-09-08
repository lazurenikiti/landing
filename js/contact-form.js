(function(){
  const form    = document.getElementById('contact-form');
  const success = document.getElementById('contact-success');
  const email   = document.getElementById('cf-email');
  const nameEl  = document.getElementById('cf-name');
  const message = document.getElementById('cf-message');
  const errName = document.getElementById('err-name');
  const errEmail= document.getElementById('err-email');
  const errMsg  = document.getElementById('err-message');
  const sending = document.getElementById('cf-sending');

  // TODO: replace with your real Worker endpoint
  const ENDPOINT = "https://YOUR-WORKER.username.workers.dev";

  const isEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

  function validate(){
    let ok = true;
    if (!nameEl.value.trim()){
      errName.hidden = false; nameEl.setAttribute('aria-invalid','true'); ok = false;
    } else { errName.hidden = true; nameEl.removeAttribute('aria-invalid'); }
    if (!isEmail(email.value.trim())){
      errEmail.hidden = false; email.setAttribute('aria-invalid','true'); ok = false;
    } else { errEmail.hidden = true; email.removeAttribute('aria-invalid'); }
    if (message.value.trim().length < 5){
      errMsg.hidden = false; message.setAttribute('aria-invalid','true'); ok = false;
    } else { errMsg.hidden = true; message.removeAttribute('aria-invalid'); }
    return ok;
  }

  async function onSubmit(e){
    e.preventDefault();
    if (!validate()) return;
    sending.hidden = false;

    try{
      const res = await fetch(ENDPOINT, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          name: nameEl.value.trim(),
          email: email.value.trim(),
          message: message.value.trim()
        })
      });
      if (!res.ok) throw new Error(await res.text().catch(()=> ''));
      // collapse the form and show success
      const h = form.getBoundingClientRect().height;
      form.style.height = h + 'px';
      requestAnimationFrame(()=>{
        form.classList.add('collapsing');
        form.style.height = '0px';
        setTimeout(()=>{
          form.hidden = true;
          success.hidden = true; // ensure hidden -> then show to retrigger a11y live region if needed
          success.hidden = false;
        }, 260);
      });
      form.reset();
    } catch(err){
      console.error(err);
      alert(document.querySelector('[data-i18n="contact.form.error"]')?.textContent || 'Something went wrong. Please try again later.');
    } finally{
      sending.hidden = true;
    }
  }

  form?.addEventListener('submit', onSubmit);
})();