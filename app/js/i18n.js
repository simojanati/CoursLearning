import { DEFAULT_LANG, SUPPORTED_LANGS, BRAND } from './app-config.js';
import { getLang, setLang, getContentLang, setContentLang } from './storage.js';
import { I18N_DICT } from './i18n-dict.js';
import { fetchPlatformSettings } from './api.js';

let currentLang = DEFAULT_LANG; // UI language
let contentLang = DEFAULT_LANG; // Data/content language (FR/EN/AR)

export function getCurrentLang(){ return currentLang; }
export function getCurrentContentLang(){ return contentLang; }

export function t(key){
  const dict = I18N_DICT[currentLang] || {};
  return dict[key] || (I18N_DICT[DEFAULT_LANG]||{})[key] || key;
}

export function initI18n(){
  currentLang = getLang(DEFAULT_LANG);
  if (!SUPPORTED_LANGS.includes(currentLang)) currentLang = DEFAULT_LANG;

  // Data/content language: follow UI language when available.
  // Fallback behavior remains safe because pickField() falls back to FR/EN/base if *_ar is missing.
  const savedContent = getContentLang(DEFAULT_LANG);
  contentLang = SUPPORTED_LANGS.includes(currentLang)
    ? currentLang
    : (SUPPORTED_LANGS.includes(savedContent) ? savedContent : DEFAULT_LANG);
  setContentLang(contentLang);

  applyLangToDocument();
  translatePage();

  // Platform branding (cached -> then refresh)
  try {
    const cached = _lhSafeGetLS('LH_PLATFORM_SETTINGS');
    if (cached) applyPlatformBranding(JSON.parse(cached), currentLang);
  } catch(e) {}
  try {
    fetchPlatformSettings(currentLang).then((s) => {
      if (s) {
        _lhSafeSetLS('LH_PLATFORM_SETTINGS', JSON.stringify(s));
        applyPlatformBranding(s, currentLang);
      }
    });
  } catch(e) {}

  window.dispatchEvent(new CustomEvent('lang:changed', {
    detail: { uiLang: currentLang, contentLang }
  }));
    try { if (typeof window.__langChangedHook === 'function') window.__langChangedHook({ uiLang: currentLang, contentLang }); } catch (e) {}
wireLanguageDropdown();
}

export function setLanguage(lang){
  const next = (SUPPORTED_LANGS.includes(lang) ? lang : DEFAULT_LANG);
  currentLang = next;
  setLang(next);

  // Content language follows UI language (FR/EN/AR).
  contentLang = next;
  setContentLang(contentLang);

  applyLangToDocument();
  translatePage();

  // Re-apply platform branding for new lang
  try {
    const cached = _lhSafeGetLS('LH_PLATFORM_SETTINGS');
    if (cached) applyPlatformBranding(JSON.parse(cached), currentLang);
  } catch(e) {}

  window.dispatchEvent(new CustomEvent('lang:changed', {
    detail: { uiLang: currentLang, contentLang }
  }));
  try { if (typeof window.__langChangedHook === 'function') window.__langChangedHook({ uiLang: currentLang, contentLang }); } catch (e) {}
}

function applyLangToDocument(){
  const html = document.documentElement;
  html.lang = currentLang;

  const isRtl = currentLang === 'ar';
  html.dir = isRtl ? 'rtl' : 'ltr';
  document.body.classList.toggle('rtl', isRtl);
  document.body.classList.toggle('ltr', !isRtl);

  let link = document.getElementById('arabicFontLink');
  if (!link){
    link = document.createElement('link');
    link.id = 'arabicFontLink';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap';
    document.head.appendChild(link);
  }

  // Fix language dropdown alignment in RTL so it opens inward and stays on-screen.
  try { _fixLangDropdownAlignment(isRtl); } catch(e) {}
}

function _fixLangDropdownAlignment(isRtl){
  const menus = document.querySelectorAll('.lang-dropdown-menu');
  menus.forEach((m) => {
    m.classList.toggle('dropdown-menu-start', !!isRtl);
    m.classList.toggle('dropdown-menu-end', !isRtl);
  });
}

export function translatePage(){
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (!key) return;
    el.textContent = t(key);
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (!key) return;
    el.setAttribute('placeholder', t(key));
  });

  const titleKey = document.body.getAttribute('data-i18n-title');
  if (titleKey){
    document.title = t(titleKey) + ' | ' + (BRAND?.name || 'LearnHub');
  }

  const lab = document.getElementById('langLabel');
  if (lab) lab.textContent = currentLang.toUpperCase();
}

function wireLanguageDropdown(){
  document.querySelectorAll('[data-lang]').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      setLanguage(a.getAttribute('data-lang') || DEFAULT_LANG);
    });
  });
}

export function pickField(obj, base){
  const lang = contentLang;
  const snake = `${base}_${lang}`;
  const camel = base + lang.toUpperCase();

  if (obj && obj[snake] != null && obj[snake] !== '') return obj[snake];
  if (obj && obj[camel] != null && obj[camel] !== '') return obj[camel];
  if (obj && obj[base] != null && obj[base] !== '') return obj[base];
  return '';
}

export function levelLabel(levelOrKey){
  const key = String(levelOrKey||'').toLowerCase();
  if (['beginner','intermediate','advanced'].includes(key)){
    return t('level.'+key);
  }
  return String(levelOrKey||'');
}


// -------------------- Platform branding (optional) --------------------
function _lhSafeGetLS(key){
  try { return localStorage.getItem(key); } catch(e){ return null; }
}
function _lhSafeSetLS(key, val){
  try { localStorage.setItem(key, val); } catch(e){}
}

function applyPlatformBranding(settings, lang){
  if (!settings) return;

  const name = settings.appName || 'LearnHub';

  // Navbar brand text (works across Sneat pages)
  document.querySelectorAll('.app-brand-text').forEach(el => { el.textContent = name; });

  // Brand logo/icon if provided
  if (settings.iconUrl){
    document.querySelectorAll('.app-brand-logo img').forEach(img => { img.src = settings.iconUrl; });
  }
  if (settings.logoUrl){
    // Landing page logo (if any img has data-brand-logo)
    document.querySelectorAll('img[data-brand-logo]').forEach(img => { img.src = settings.logoUrl; });
  }

  // Footer text
  const footerText =
    (lang === 'ar' ? settings.footer_ar : lang === 'en' ? settings.footer_en : settings.footer_fr) ||
    settings.footer_en || settings.footer_fr || settings.footer_ar || '';

  const footerEl = document.querySelector('footer .mb-2.mb-md-0');
  if (footerEl && footerText) footerEl.textContent = footerText;

  // Optional primary color hook
  if (settings.primaryColor){
    document.documentElement.style.setProperty('--lh-primary', settings.primaryColor);
  }
}