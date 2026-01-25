// LearnHub Theme Manager (light / dark)
// Persisted in localStorage key: learnHub:theme (values: 'light' | 'dark' | 'system')

const STORAGE_KEY = 'learnHub:theme';

function safeGet(key){
  try { return localStorage.getItem(key); } catch(e) { return null; }
}

function safeSet(key, value){
  try { localStorage.setItem(key, value); } catch(e) {}
}

function getSystemTheme(){
  try {
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  } catch (e) {
    return 'light';
  }
}

export function getThemePreference(){
  const pref = safeGet(STORAGE_KEY) || 'system';
  if (pref !== 'light' && pref !== 'dark' && pref !== 'system') return 'system';
  return pref;
}

export function getEffectiveTheme(){
  const pref = getThemePreference();
  return pref === 'system' ? getSystemTheme() : pref;
}

function getAssetsPath(){
  // Pages set data-assets-path on <html>
  return document.documentElement.getAttribute('data-assets-path') || 'assets/';
}

function updateBrandAssets(effective){
  const assetsPath = getAssetsPath();
  const logoLight = assetsPath + 'img/brand/logo.png';
  const logoDark  = assetsPath + 'img/brand/logo-light.png';
  const iconLight = assetsPath + 'img/brand/icon.png';
  const iconDark  = assetsPath + 'img/brand/icon-light.png';

  // Landing page logo (explicit marker)
  document.querySelectorAll('img[data-brand-logo]').forEach(img => {
    img.src = (effective === 'dark') ? logoDark : logoLight;
  });

  // Optional icon marker (not required, but supported)
  document.querySelectorAll('img[data-brand-icon]').forEach(img => {
    img.src = (effective === 'dark') ? iconDark : iconLight;
  });

  // Sidebar brand icon on app pages (only override if it's using our local brand assets)
  document.querySelectorAll('.app-brand-logo img').forEach(img => {
    const src = String(img.getAttribute('src') || '');
    if (src && !src.includes('img/brand/')) return;
    img.src = (effective === 'dark') ? iconDark : iconLight;
  });
}

export function applyTheme(theme){
  const effective = (theme === 'system') ? getSystemTheme() : theme;
  document.documentElement.setAttribute('data-lh-theme', effective);

  // Swap brand assets (logo/icon) to keep them visible in dark mode
  updateBrandAssets(effective);

  // Update toggle icons if present
  const btns = [
    document.getElementById('lhThemeToggle'),
    document.getElementById('lhLandingThemeToggle')
  ].filter(Boolean);

  btns.forEach((btn) => {
    const icon = btn.querySelector('i');
    if (!icon) return;
    const isDark = effective === 'dark';
    icon.classList.remove('bx-moon', 'bx-sun');
    icon.classList.add(isDark ? 'bx-sun' : 'bx-moon');
    btn.setAttribute('aria-label', isDark ? 'Switch to light theme' : 'Switch to dark theme');
  });
}

export function setThemePreference(pref){
  if (pref !== 'light' && pref !== 'dark' && pref !== 'system') pref = 'system';
  safeSet(STORAGE_KEY, pref);
  applyTheme(pref);
}

export function toggleTheme(){
  const effective = getEffectiveTheme();
  const next = effective === 'dark' ? 'light' : 'dark';
  setThemePreference(next);
}

export function initTheme(){
  applyTheme(getThemePreference());

  // React to OS theme changes if we're in system mode
  try {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    if (mql && typeof mql.addEventListener === 'function'){
      mql.addEventListener('change', () => {
        if (getThemePreference() === 'system') applyTheme('system');
      });
    }
  } catch(e) {}
}

export function bindThemeToggle(button){
  if (!button || button.dataset.lhBoundTheme) return;
  button.dataset.lhBoundTheme = '1';
  button.addEventListener('click', (e) => {
    e.preventDefault();
    toggleTheme();
  });
  // Ensure icon + assets match the current theme
  applyTheme(getThemePreference());
}
