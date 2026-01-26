import { authLogin, authRegister, authConfirmEmail, authForgotPassword, authResetPassword, setTokenProvider } from './api.js';

const TOKEN_KEY = 'authToken';
const USER_KEY  = 'authUser';

// Provide auth token to API layer
try { setTokenProvider(() => getToken()); } catch {}

function b64urlDecode(str){
  // base64url -> base64
  str = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
  // pad
  while (str.length % 4) str += '=';
  try { return decodeURIComponent(escape(atob(str))); } catch { 
    try { return atob(str); } catch { return ''; }
  }
}

export function decodeJwt(token){
  try {
    const parts = String(token).split('.');
    if (parts.length < 2) return null;
    const payload = JSON.parse(b64urlDecode(parts[1]));
    return payload || null;
  } catch { return null; }
}

export function getToken(){
  try { return localStorage.getItem(`learnHub:${TOKEN_KEY}`) || null; } catch { return null; }
}

export function setToken(token){
  try {
    if (!token) localStorage.removeItem(`learnHub:${TOKEN_KEY}`);
    else localStorage.setItem(`learnHub:${TOKEN_KEY}`, String(token));
  } catch {}
}

export function getUser(){
  try {
    const raw = localStorage.getItem(`learnHub:${USER_KEY}`);
    if (raw) return JSON.parse(raw);
  } catch {}
  // fallback from JWT
  const t = getToken();
  const p = t ? decodeJwt(t) : null;
  if (!p) return null;
  return { userId: p.sub, email: p.email, role: p.role, exp: p.exp };
}

export function setUser(user){
  try {
    if (!user) localStorage.removeItem(`learnHub:${USER_KEY}`);
    else localStorage.setItem(`learnHub:${USER_KEY}`, JSON.stringify(user));
  } catch {}
}

export function isAuthenticated(){
  const t = getToken();
  if (!t) return false;
  const p = decodeJwt(t);
  if (!p || !p.exp) return true;
  const now = Math.floor(Date.now()/1000);
  return now < Number(p.exp);
}

export function hasRole(...roles){
  const u = getUser();
  if (!u) return false;
  if (!roles || !roles.length) return true;
  return roles.includes(String(u.role));
}

export function logout(redirectTo = '../../index.html'){
  setToken(null);
  setUser(null);
  // also clear legacy admin flag if any
  try { localStorage.removeItem('adminMode'); } catch {}
  if (redirectTo) window.location.href = redirectTo;
}

export async function login(email, password){
  const res = await authLogin(email, password);
  if (res && res.token){
    setToken(res.token);
    setUser(res.user || getUser());
    return res.user;
  }
  throw new Error(res?.error || 'LOGIN_FAILED');
}


export async function register({ email, password, firstName='', lastName='', role='student', appBaseUrl='' } = {}){
  const res = await authRegister({ email, password, firstName, lastName, role, appBaseUrl });
  // register does not auto-login by default
  if (res && res.error) throw new Error(res.error);
  return res;
}



export async function confirmEmail({ email, token, appBaseUrl='' } = {}){
  const res = await authConfirmEmail({ email, token, appBaseUrl });
  if (res && res.token){
    setToken(res.token);
    setUser(res.user || getUser());
    return res.user;
  }
  throw new Error(res?.error || 'CONFIRM_FAILED');
}


export async function forgotPassword(email){
  const res = await authForgotPassword({ email });
  if (res && (res.ok === true || res.ok === undefined)) return true;
  if (res && res.error) throw new Error(res.error);
  return true;
}

export async function resetPassword({ email, code, newPassword } = {}){
  const res = await authResetPassword({ email, code, newPassword });
  if (res && res.ok) return true;
  if (res && res.error) throw new Error(res.error);
  return true;
}


export function requireAuth({ roles = ['student','admin'], redirectTo = 'login.html' } = {}){
  // Store/compute returnTo as a page-relative value (e.g., "lesson.html?x=1#y")
  const pathParts = String(window.location.pathname || '').split('/');
  const page = pathParts[pathParts.length - 1] || 'home.html';
  const returnTo = page + (window.location.search || '') + (window.location.hash || '');

  if (!isAuthenticated()){
    const url = new URL(redirectTo, window.location.href);
    url.searchParams.set('returnTo', returnTo);
    window.location.href = url.pathname + url.search;
    // stop current module execution
    throw new Error('AUTH_REQUIRED');
  }

  if (roles && roles.length && !hasRole(...roles)){
    // If logged but not allowed, send to index
    window.location.href = '../../index.html';
    throw new Error('FORBIDDEN');
  }

  // Remember last visited in-app page for "normal" logins
  try { localStorage.setItem('lh_lastPage', returnTo); } catch {}
  return getUser();
}
