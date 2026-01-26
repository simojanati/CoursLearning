import { initI18n, t } from './i18n.js';
import { register, isAuthenticated, hasRole } from './auth.js';

function qs(sel){ return document.querySelector(sel); }

function getAppPagesBaseUrl(){
  try {
    const u = new URL(window.location.href);
    const basePath = u.pathname.replace(/\/app\/pages\/.*$/, '/app/pages');
    return u.origin + basePath;
  } catch(e){
    return '';
  }
}

function getParam(name){
  try { return new URL(window.location.href).searchParams.get(name); } catch { return null; }
}

async function init(){
  await initI18n();

  if (isAuthenticated() && (hasRole('student','admin'))){
    const rt = getParam('returnTo');
    window.location.href = rt ? `./${rt}` : './home.html';
    return;
  }

  const form = qs('#registerForm');
  const err = qs('#errBox');
  const btn = qs('#btnRegister');
  const sp = qs('#registerSpinner');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.classList.add('d-none');

    const password = qs('#password').value;
    const password2 = qs('#password2').value;
    if (password !== password2){
      err.textContent = t('auth.err.passwordMismatch','Passwords do not match');
      err.classList.remove('d-none');
      return;
    }

    const payload = {
      firstName: qs('#firstName').value.trim(),
      lastName: qs('#lastName').value.trim(),
      email: qs('#email').value.trim(),
      password: password
    };

    try {
      if (btn) btn.disabled = true;
      if (sp) sp.classList.remove('d-none');
      const res = await register({ ...payload, appBaseUrl: getAppPagesBaseUrl() });
      // Redirect to login with a hint (manual activation code)
      const emailEnc = encodeURIComponent(payload.email);
      window.location.href = `./verify.html?registered=1&email=${emailEnc}`;
    } catch (ex){
      err.textContent = String(ex?.message || ex || 'Register failed');
      err.classList.remove('d-none');
    } finally {
      if (btn) btn.disabled = false;
      if (sp) sp.classList.add('d-none');
    }
  });
}

init();
