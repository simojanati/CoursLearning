let _pwaInitDone = false;

function ensureHeadLink(rel, href, extraAttrs = {}) {
  if (document.querySelector(`link[rel="${rel}"][href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = rel;
  link.href = href;
  Object.entries(extraAttrs).forEach(([k,v]) => link.setAttribute(k, v));
  document.head.appendChild(link);
}

function ensureMeta(name, content) {
  if (document.querySelector(`meta[name="${name}"]`)) return;
  const meta = document.createElement('meta');
  meta.name = name;
  meta.content = content;
  document.head.appendChild(meta);
}

export function initPWA() {
  if (_pwaInitDone) return;
  _pwaInitDone = true;

  try {
    // Manifest + icons (best effort; useful if some pages didn't include them in HTML)
    ensureHeadLink('manifest', `${getBasePath_()}manifest.webmanifest`);
    ensureMeta('theme-color', '#696cff');

    // iOS: add to home screen icon
    const appleIconHref = `${getBasePath_()}assets/img/icons/icon-192.png`;
    if (!document.querySelector(`link[rel="apple-touch-icon"]`)) {
      ensureHeadLink('apple-touch-icon', appleIconHref);
    }

    // Register service worker
    if ('serviceWorker' in navigator) {
      const swUrl = `${getBasePath_()}service-worker.js`;
      navigator.serviceWorker.register(swUrl).catch(() => {});
    }
  } catch (_) {
    // no-op
  }
}

// Determine repo base path for GitHub Pages (supports / or /repo/)
function getBasePath_() {
  // Use current path, but trim everything after last '/' to get directory
  // Then walk up to site root if we're inside /app/pages/...
  const p = location.pathname;
  const idx = p.indexOf('/app/');
  if (idx >= 0) return p.slice(0, idx + 1);
  // otherwise, root dir
  return p.endsWith('/') ? p : p.substring(0, p.lastIndexOf('/') + 1);
}


let _installInitDone = false;
let _deferredPrompt = null;

function getLang_() {
  try {
    const v = localStorage.getItem('learnHub:lang') || localStorage.getItem('learnHub:language');
    if (v) return String(v).toLowerCase();
  } catch(e){}
  return (document.documentElement.lang || 'fr').toLowerCase();
}

function tr_(key){
  const lang = getLang_();
  const isAr = lang.startsWith('ar');
  const isEn = lang.startsWith('en');
  const dict = {
    fr: {
      title: "Installer LearnHub",
      desc: "Accès rapide, plein écran, comme une application.",
      install: "Installer",
      ios: "Sur iPhone: bouton Partager → Ajouter à l’écran d’accueil.",
      later: "Plus tard"
    },
    en: {
      title: "Install LearnHub",
      desc: "Quick access, fullscreen, like an app.",
      install: "Install",
      ios: "On iPhone: Share → Add to Home Screen.",
      later: "Later"
    },
    ar: {
      title: "تثبيت LearnHub",
      desc: "دخول سريع وبوضع ملء الشاشة مثل تطبيق.",
      install: "تثبيت",
      ios: "في الآيفون: مشاركة → إضافة إلى الشاشة الرئيسية.",
      later: "لاحقاً"
    }
  };
  const d = isAr ? dict.ar : (isEn ? dict.en : dict.fr);
  return d[key] || d.title;
}

function isStandalone_(){
  try{
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
    if (window.navigator && window.navigator.standalone) return true; // iOS
  }catch(e){}
  return false;
}

function isIOS_(){
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
}

function createInstallBar_(){
  if (document.getElementById('lhInstallBar')) return;

  const bar = document.createElement('div');
  bar.id = 'lhInstallBar';
  bar.className = 'lh-install-bar';

  const inner = document.createElement('div');
  inner.className = 'lh-install-inner';

  const txt = document.createElement('div');
  txt.className = 'lh-install-text';
  txt.innerHTML = `
    <div class="lh-install-title">${tr_('title')}</div>
    <div class="lh-install-desc">${tr_('desc')}</div>
    <div class="lh-install-ios d-none">${tr_('ios')}</div>
  `;

  const actions = document.createElement('div');
  actions.className = 'lh-install-actions';

  const btnInstall = document.createElement('button');
  btnInstall.type = 'button';
  btnInstall.className = 'btn btn-sm btn-primary lh-install-btn';
  btnInstall.textContent = tr_('install');

  const btnLater = document.createElement('button');
  btnLater.type = 'button';
  btnLater.className = 'btn btn-sm btn-outline-secondary lh-install-later';
  btnLater.textContent = tr_('later');

  actions.appendChild(btnInstall);
  actions.appendChild(btnLater);

  inner.appendChild(txt);
  inner.appendChild(actions);
  bar.appendChild(inner);

  document.body.appendChild(bar);

  btnLater.addEventListener('click', () => {
    try { localStorage.setItem('learnHub:pwaDismissed', String(Date.now())); } catch(e){}
    hideInstallBar_();
  });

  btnInstall.addEventListener('click', async () => {
    // iOS: no native prompt, show hint
    if (isIOS_() && !_deferredPrompt){
      const ios = bar.querySelector('.lh-install-ios');
      if (ios) ios.classList.remove('d-none');
      return;
    }
    if (!_deferredPrompt) return;

    try{
      _deferredPrompt.prompt();
      const choice = await _deferredPrompt.userChoice;
      _deferredPrompt = null;
      if (choice && choice.outcome === 'accepted') hideInstallBar_();
    }catch(e){}
  });

  // If no prompt available, disable install button (except iOS where we show instructions)
  if (!_deferredPrompt && !isIOS_()){
    btnInstall.disabled = true;
    btnInstall.classList.add('disabled');
  }
}

function showInstallBar_(){
  const bar = document.getElementById('lhInstallBar') || createInstallBar_();
  const b = document.getElementById('lhInstallBar');
  if (b) { b.classList.add('show'); document.body.classList.add('lh-has-installbar'); }
}

function hideInstallBar_(){
  const b = document.getElementById('lhInstallBar');
  if (b) { b.classList.remove('show'); document.body.classList.remove('lh-has-installbar'); }
}

function shouldShowInstallBar_(){
  if (isStandalone_()) return false;
  try{
    const dismissedAt = localStorage.getItem('learnHub:pwaDismissed');
    // dismissed only for this browser until next day (24h)
    if (dismissedAt){
      const age = Date.now() - Number(dismissedAt);
      if (!isNaN(age) && age < 24*60*60*1000) return false;
    }
  }catch(e){}
  return true;
}

export function initInstallBar(){
  if (_installInitDone) return;
  _installInitDone = true;

  try{
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      _deferredPrompt = e;
      if (shouldShowInstallBar_()) {
        createInstallBar_();
        // enable button
        const btn = document.querySelector('#lhInstallBar .lh-install-btn');
        if (btn) {
          btn.disabled = false;
          btn.classList.remove('disabled');
        }
        showInstallBar_();
      }
    });

    window.addEventListener('appinstalled', () => {
      try { localStorage.removeItem('learnHub:pwaDismissed'); } catch(e){}
      hideInstallBar_();
    });

    document.addEventListener('DOMContentLoaded', () => {
      if (!shouldShowInstallBar_()) return;
      // On iOS, show bar even without prompt so user sees instructions on click
      if (isIOS_()){
        createInstallBar_();
        showInstallBar_();
      }
    });
  }catch(e){}
}

