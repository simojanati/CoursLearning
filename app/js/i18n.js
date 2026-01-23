import { DEFAULT_LANG, SUPPORTED_LANGS } from './app-config.js';
import { getLang, setLang, getContentLang, setContentLang } from './storage.js';
import { I18N_DICT } from './i18n-dict.js';

let currentLang = DEFAULT_LANG; // UI language
let contentLang = DEFAULT_LANG; // Data language (FR/EN only)

export function getCurrentLang(){ return currentLang; }
export function getCurrentContentLang(){ return contentLang; }

export function t(key){
  const dict = I18N_DICT[currentLang] || {};
  return dict[key] || (I18N_DICT[DEFAULT_LANG]||{})[key] || key;
}

export function initI18n(){
  currentLang = getLang(DEFAULT_LANG);
  if (!SUPPORTED_LANGS.includes(currentLang)) currentLang = DEFAULT_LANG;

  // Data/content language: only FR/EN exist in sheets content.
  // If UI is FR/EN -> content follows UI. If UI is AR -> keep last saved FR/EN.
  const savedContent = getContentLang(DEFAULT_LANG);
  contentLang = (currentLang === 'fr' || currentLang === 'en')
    ? currentLang
    : (savedContent === 'en' ? 'en' : 'fr');
  setContentLang(contentLang);

  applyLangToDocument();
  translatePage();

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

  // Content language behavior:
  // - If user selects FR/EN: content switches to that language.
  // - If user selects AR: content stays as last selected FR/EN.
  if (next === 'fr' || next === 'en'){
    contentLang = next;
    setContentLang(contentLang);
  } else {
    const savedContent = getContentLang(DEFAULT_LANG);
    contentLang = (savedContent === 'en' ? 'en' : 'fr');
  }

  applyLangToDocument();
  translatePage();

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
    document.title = t(titleKey) + ' | VBA Eco Academy';
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
