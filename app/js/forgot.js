import { initI18n, t } from './i18n.js';
import { forgotPassword } from './auth.js';

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

async function init(){
  initI18n();
  const form = qs('#forgotForm');
  const err = qs('#errBox');
  const ok = qs('#okBox');
  const btn = qs('#btnSend');
  const sp = qs('#sendSpinner');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.classList.add('d-none');
    ok.classList.add('d-none');
    const email = qs('#email').value.trim();
    try {
      btn.disabled = true;
      sp.classList.remove('d-none');
      await forgotPassword(email, getAppPagesBaseUrl());
      ok.textContent = t('auth.forgot.ok');
      ok.classList.remove('d-none');
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
