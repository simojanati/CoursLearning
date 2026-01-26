import { initGlobalSearch } from './global-search.js';
import { bindThemeToggle, initTheme } from './theme.js';
import { getUser, isAuthenticated, logout } from './auth.js';
import { t } from './i18n.js';
/**
 * Shared layout loader (topbar injection) to avoid duplicating navbar markup.
 *
 * Usage (in each page module):
 *   import { ensureTopbar } from './layout.js';
 *   await ensureTopbar({ showSearch: true, searchPlaceholderKey: 'courses.searchPlaceholder' });
 */

let _topbarPromise = null;

function renderAuthMenu_(){
  const menu = document.getElementById('lhAuthMenu');
  if (!menu) return;

  const u = getUser();
  const authed = isAuthenticated() && u;

  if (!authed){
    menu.innerHTML = `
      <li><a class="dropdown-item" href="../pages/login.html"><i class="bx bx-log-in me-2"></i>${t('auth.loginLink','Login')}</a></li>
      <li><a class="dropdown-item" href="../pages/register.html"><i class="bx bx-user-plus me-2"></i>${t('auth.registerLink','Register')}</a></li>
    `;
    return;
  }

  const role = String(u.role || '').toUpperCase();
  menu.innerHTML = `
    <li class="px-3 py-2">
      <div class="fw-semibold">${u.email || ''}</div>
      <div class="text-muted small">${role}</div>
    </li>
    <li><hr class="dropdown-divider"></li>
    <li><a class="dropdown-item" href="../pages/home.html"><i class="bx bx-home me-2"></i>${t('topbar.dashboard','Dashboard')}</a></li>
    <li><a class="dropdown-item" href="#" id="lhLogoutBtn"><i class="bx bx-power-off me-2"></i>${t('topbar.logout','Logout')}</a></li>
  `;

  const btn = document.getElementById('lhLogoutBtn');
  if (btn){
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      logout('../../index.html');
    });
  }
}

export async function ensureTopbar(options = {}){
  if (_topbarPromise) return _topbarPromise;
  _topbarPromise = (async () => {
    const mount = document.getElementById('lhTopbar');
    if (!mount) return;

    const url = new URL('../partials/topbar.html', import.meta.url);
    const html = await (await fetch(url)).text();
    mount.innerHTML = html;

    // Bind the mobile menu toggler.
    // NOTE: topbar is injected after assets/js/main.js runs, so Sneat's
    // default querySelectorAll('.layout-menu-toggle') binding will NOT
    // include the injected toggler.
    const injectedToggler = mount.querySelector('a.layout-menu-toggle');
    if (injectedToggler && !injectedToggler.dataset.lhBound){
      injectedToggler.dataset.lhBound = '1';
      injectedToggler.addEventListener('click', (event) => {
        event.preventDefault();
        if (window.Helpers && typeof window.Helpers.toggleCollapsed === 'function'){
          window.Helpers.toggleCollapsed();
        } else {
          // Fallback: toggle expected class on the root element
          document.documentElement.classList.toggle('layout-menu-expanded');
        }
      });
    }

    // Configure search visibility/placeholder
    const showSearch = options.showSearch !== false;
    const searchWrap = mount.querySelector('.lh-topbar-search');
    const searchInput = mount.querySelector('#lhTopSearch');
    if (searchWrap) searchWrap.classList.toggle('d-none', !showSearch);
    if (searchInput){
      if (options.searchPlaceholderKey){
        searchInput.setAttribute('data-i18n-placeholder', options.searchPlaceholderKey);
      }
      // Clear any previous value on navigation
      if (!options.preserveSearchValue) searchInput.value = '';

      // Init global search dropdown
      const menu = mount.querySelector('#lhGlobalSearchMenu');
      initGlobalSearch({ input: searchInput, menu });

    }

    // Theme toggle (shared across pages)
    try {
      initTheme();
    renderAuthMenu_();
      const themeBtn = mount.querySelector('#lhThemeToggle');
      if (themeBtn) bindThemeToggle(themeBtn);
    } catch (e) {}

    // Notify page scripts that topbar is ready
    window.dispatchEvent(new CustomEvent('lh:topbar:ready', { detail: { showSearch } }));
  })();

  return _topbarPromise;
}