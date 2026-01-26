import { initI18n } from './i18n.js';
import { confirmEmail, resendVerification } from './auth.js';

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
  const token = getParam('token');

  const info = qs('#infoBox');
  const err = qs('#errBox');
  const ok = qs('#okBox');
  const goLogin = qs('#goLogin');
  const resendWrap = qs('#resendWrap');
  const btnResend = qs('#btnResend');
  const resendSpinner = qs('#resendSpinner');

  if (!email || !token){
    info.classList.add('d-none');
    err.textContent = 'Invalid confirmation link.';
    err.classList.remove('d-none');
    if (goLogin) goLogin.classList.remove('d-none');
    if (resendWrap) resendWrap.classList.add('d-none');
    return;
  }

  try {
    const user = await confirmEmail({ email, token, appBaseUrl: getAppPagesBaseUrl() });
    info.classList.add('d-none');
    ok.textContent = 'Email confirmed. Redirecting…';
    ok.classList.remove('d-none');
    if (resendWrap) resendWrap.classList.add('d-none');
    setTimeout(()=>{ window.location.href = './home.html'; }, 900);
  } catch(ex) {
    info.classList.add('d-none');
    err.textContent = String(ex?.message || ex || 'Confirmation failed');
    err.classList.remove('d-none');
    if (goLogin) goLogin.classList.remove('d-none');
    if (resendWrap) resendWrap.classList.add('d-none');
  }
}

init();
