import { initI18n, t } from './i18n.js';
import { login, isAuthenticated, hasRole } from './auth.js';

function qs(sel){ return document.querySelector(sel); }
function getParam(name){
  try { return new URL(window.location.href).searchParams.get(name); } catch { return null; }
}

function mapAuthError(msg){
  const m = String(msg||'');
  if (m.includes('EMAIL_NOT_VERIFIED')) return 'auth.err.emailNotVerified';
  if (m.includes('INVALID_CREDENTIALS') || m.includes('BAD_CREDENTIALS')) return 'auth.err.invalidCredentials';
  if (m.includes('USER_NOT_FOUND')) return 'auth.err.userNotFound';
  if (m.includes('FORBIDDEN')) return 'auth.err.forbidden';
  return null;
}

function safeTarget(rt){
  if (!rt) return null;
  rt = String(rt);
  // avoid redirecting back to auth pages
  const low = rt.toLowerCase();
  if (low.includes('login.html') || low.includes('register.html') || low.includes('verify.html') || low.includes('forgot.html') || low.includes('reset.html')) return null;
  return rt;
}

function getLastPage(){
  try {
    const v = localStorage.getItem('lh_lastPage');
    return safeTarget(v);
  } catch { return null; }
}

function goAfterLogin(){
  const rt = safeTarget(getParam('returnTo'));
  const lp = getLastPage();
  const target = rt || lp || './home.html';
  window.location.href = target;
}


async function init(){
  await initI18n();

  // Already logged in
  if (isAuthenticated() && (hasRole('student','admin'))){
    const rt = getParam('returnTo');
    goAfterLogin();
    return;
  }

  const err = qs('#errBox');
  const ok = qs('#successBox');
  const form = qs('#loginForm');
  const verifyActions = qs('#verifyActions');
  const btnGoVerify = qs('#btnGoVerify');
  const lnkForgot = qs('#lnkForgot');
  const emailInput = qs('#email');
  if (lnkForgot && emailInput){
    const setHref = ()=>{
      const v = (emailInput.value||'').trim();
      lnkForgot.href = v ? (`./forgot.html?email=${encodeURIComponent(v)}`) : './forgot.html';
    };
    emailInput.addEventListener('input', setHref);
    setHref();
  }


  const verified = getParam('verified');
  const resetDone = getParam('reset');
  if (ok) { ok.classList.add('d-none'); ok.textContent=''; }
  if (verified === '1' && ok){
    ok.textContent = t('auth.msg.verifiedSuccess','Votre compte est activé. Vous pouvez vous connecter.');
    ok.classList.remove('d-none');
  }
  if (resetDone === '1' && ok){
    ok.textContent = t('auth.msg.resetSuccess','Mot de passe mis à jour. Vous pouvez vous connecter.');
    ok.classList.remove('d-none');
  }

  // If came from register
  const registered = getParam('registered');
  const regEmail = getParam('email');
  if (registered === '1'){
    if (err){
      err.textContent = t('auth.msg.registeredPending','Compte créé. Contacte l\'admin pour obtenir ton code d\'activation, puis active ton compte.');
      err.classList.remove('d-none');
    }
    if (verifyActions) verifyActions.classList.remove('d-none');
    if (regEmail) {
      const decoded = (()=>{ try{return decodeURIComponent(regEmail);}catch{return regEmail;} })();
      const emailInput = qs('#email'); if (emailInput) emailInput.value = decoded;
      if (btnGoVerify) btnGoVerify.href = './verify.html?email=' + encodeURIComponent(decoded);
    }
  }

  form?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    if (err){ err.classList.add('d-none'); err.textContent=''; }
    if (verifyActions) verifyActions.classList.add('d-none');

    const email = qs('#email')?.value?.trim() || '';
    const password = qs('#password')?.value || '';
    const btn = qs('#btnLogin');
    const sp = qs('#loginSpinner');

    try{
      if (btn) btn.disabled = true;
      if (sp) sp.classList.remove('d-none');
      await login(email, password);
      const rt = getParam('returnTo');
      goAfterLogin();
    } catch(ex){
      const msg = String(ex?.message || ex || 'Login failed');
      const key = mapAuthError(msg);
      if (err){ err.textContent = key ? t(key,msg) : msg; err.classList.remove('d-none'); }
      if (msg.includes('EMAIL_NOT_VERIFIED')){
        if (verifyActions) verifyActions.classList.remove('d-none');
        if (btnGoVerify) btnGoVerify.href = './verify.html?email=' + encodeURIComponent(email);
      }
    } finally {
      if (btn) btn.disabled = false;
      if (sp) sp.classList.add('d-none');
    }
  });
}

init();
