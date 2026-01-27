import { initI18n, t } from './i18n.js';
import { authVerifyCode } from './api.js';

function qs(sel){ return document.querySelector(sel); }
function getParam(name){ return new URLSearchParams(window.location.search).get(name); }

function mapVerifyError(msg){
  const m = String(msg||'');
  if (m.includes('CODE_INVALID')) return 'auth.err.codeInvalid';
  if (m.includes('CODE_EXPIRED')) return 'auth.err.codeExpired';
  if (m.includes('EMAIL_NOT_FOUND') || m.includes('USER_NOT_FOUND')) return 'auth.err.userNotFound';
  return null;
}

async function init(){
  await initI18n();

  const emailPrefill = getParam('email');
  if (emailPrefill) qs('#email').value = emailPrefill;

  // Prefill from registration puzzle (if available)
  try{
    const se = sessionStorage.getItem('lh_verify_email');
    const sc = sessionStorage.getItem('lh_verify_code');
    if (!emailPrefill && se) qs('#email').value = se;
    if (sc) qs('#code').value = sc;
  } catch {}


  const pending = getParam('pending');
  const info = qs('#infoBox');
  if (pending && info){
    info.textContent = t('auth.verifyPendingInfo','Contact the admin to get your activation code, then enter it here.');
    info.classList.remove('d-none');
  }

  const form = qs('#verifyForm');
  const err = qs('#errBox');
  const btn = qs('#btnVerify');
  const sp = qs('#verifySpinner');

  form?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    if (err){ err.classList.add('d-none'); err.textContent=''; }
    const email = qs('#email').value.trim();
    const code = qs('#code').value.trim();

    try{
      if (btn) btn.disabled=true;
      if (sp) sp.classList.remove('d-none');
      const res = await authVerifyCode({ email, code });
      if (res && res.token){
        // store token like auth.js expects
        localStorage.setItem('learnHub:authToken', String(res.token));
        localStorage.setItem('learnHub:authUser', JSON.stringify(res.user || {}));
        window.location.href = './home.html';
      } else {
        window.location.href = './login.html?verified=1&email=' + encodeURIComponent(email);
      }
    } catch(ex){
      const msg = String(ex?.message || ex || 'Verify failed');
      const key = mapVerifyError(msg);
      if (err){ err.textContent = key ? t(key,msg) : msg; err.classList.remove('d-none'); }
    } finally {
      if (btn) btn.disabled=false;
      if (sp) sp.classList.add('d-none');
    }
  });
}

init();
