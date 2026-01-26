import { initI18n, t } from './i18n.js';
import { resetPassword } from './auth.js';

function qs(sel){ return document.querySelector(sel); }
function getParam(name){ try { return new URL(window.location.href).searchParams.get(name); } catch { return null; } }

function getAppPagesBaseUrl(){
  try {
    const u = new URL(window.location.href);
    const basePath = u.pathname.replace(/\/app\/pages\/.*$/, '/app/pages');
    return u.origin + basePath;
  } catch(e){
    return '';
  }
}

async function init(){
  initI18n();
  const email = getParam('email');
  const codeParam = getParam('code');
  
  const form = qs('#resetForm');
  const err = qs('#errBox');
  const ok = qs('#okBox');
  const btn = qs('#btnReset');
  const sp = qs('#resetSpinner');

  if (email){ qs('#email').value = email; }
  if (codeParam){ qs('#code').value = codeParam; }

  // Manual reset: user must provide email + code
  if (!qs('#email') || !qs('#code')){
    err.textContent = t('auth.reset.invalidLink');
    err.classList.remove('d-none');
    form.classList.add('d-none');
    return;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.classList.add('d-none');
    ok.classList.add('d-none');
    const p1 = qs('#password').value;
    const p2 = qs('#password2').value;
    if (p1 !== p2){
      err.textContent = t('auth.reset.pwMismatch');
      err.classList.remove('d-none');
      return;
    }
    try {
      btn.disabled = true;
      sp.classList.remove('d-none');
      const emailVal = qs('#email').value.trim();
      const codeVal = qs('#code').value.trim();
      await resetPassword({ email: emailVal, code: codeVal, newPassword: p1 });
      ok.textContent = t('auth.reset.ok');
      ok.classList.remove('d-none');
      setTimeout(()=>{ const rt = getParam('returnTo');
      const url = rt ? (`./login.html?reset=1&returnTo=${encodeURIComponent(rt)}`) : './login.html?reset=1';
      window.location.href = url; }, 1200);
    } catch(ex) {
      err.textContent = String(ex?.message || ex || 'Failed');
      err.classList.remove('d-none');
    } finally {
      btn.disabled = false;
      sp.classList.add('d-none');
    }
  });
}

init();
