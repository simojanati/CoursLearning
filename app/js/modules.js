import './admin-mode.js';
import { getDomains, getModules } from './api.js';
import { qs, renderEmpty, escapeHTML, renderBreadcrumbs } from './ui.js';
import { initI18n, t, pickField } from './i18n.js';
import { ensureTopbar } from './layout.js';

const state = {
  domainId: '',
  domains: [],
  modules: []
};

function parseParams(){
  const sp = new URLSearchParams(location.search);
  state.domainId = String(sp.get('domainId') || '').trim();
}

function moduleCard(m){
  const title = pickField(m, 'title') || m.title || m.moduleId;
  const desc = pickField(m, 'description') || m.description || '';
  return `
    <div class="col-12 col-md-6 col-xl-4">
      <div class="card h-100">
        <div class="card-body">
          <h5 class="card-title mb-1">${escapeHTML(title)}</h5>
          <p class="card-text text-muted mb-3">${escapeHTML(desc)}</p>
          <a class="btn btn-primary" href="courses.html?domainId=${encodeURIComponent(state.domainId)}&moduleId=${encodeURIComponent(m.moduleId)}">
            <i class="bx bx-right-arrow-alt"></i> ${escapeHTML(t('actions.openCourses'))}
          </a>
        </div>
      </div>
    </div>
  `;
}

function render(list){
  const grid = qs('#modulesGrid');
  const empty = qs('#modulesEmpty');
  if (!grid || !empty) return;

  if (!list.length){
    grid.innerHTML = '';
    renderEmpty(empty, t('modules.empty'), '');
    return;
  }
  empty.innerHTML = '';
  grid.innerHTML = list.map(moduleCard).join('');
}

function applySearch(){
  const q = (qs('#lhTopSearch')?.value || '').toLowerCase().trim();
  let list = (state.modules || []).slice();
  if (q){
    list = list.filter(m => {
      const t1 = (pickField(m,'title')||'').toLowerCase();
      const d1 = (pickField(m,'description')||'').toLowerCase();
      return t1.includes(q) || d1.includes(q);
    });
  }
  render(list);
}

async function init(){
  await ensureTopbar({ showSearch: true, searchPlaceholderKey: 'modules.searchPlaceholder' });
  initI18n();
  parseParams();

  const hint = qs('#modulesHint');
  if (!state.domainId){
    renderEmpty(qs('#modulesEmpty'), 'Missing domainId', 'Open a domain from Home.');
    if (hint) hint.textContent = '';
    renderBreadcrumbs([
      { label: t('menu.home'), href: 'home.html' },
      { label: t('modules.title'), active: true }
    ]);
    return;
  }

  try { state.domains = await getDomains(); } catch { state.domains = []; }
  const domain = state.domains.find(d => String(d.domainId) === state.domainId);
  const domainName = domain ? (pickField(domain,'name') || domain.domainId) : state.domainId;
  if (hint) hint.textContent = `${t('courses.filter.domain')}: ${domainName}`;
  renderBreadcrumbs([
    { label: t('menu.home'), href: 'home.html' },
    { label: domainName, href: 'home.html' },
    { label: t('modules.title'), active: true }
  ]);

  try { state.modules = await getModules(state.domainId); }
  catch (e){
    state.modules = [];
    renderEmpty(qs('#modulesEmpty'), t('common.empty'), String(e.message || e));
  }

  applySearch();

  qs('#lhTopSearch')?.addEventListener('input', applySearch);

  async function onLangChange(){
    try { state.domains = await getDomains(); } catch {}
    const d = state.domains.find(x => String(x.domainId) === state.domainId);
    const name = d ? (pickField(d,'name') || d.domainId) : state.domainId;
    if (hint) hint.textContent = `${t('courses.filter.domain')}: ${name}`;
    renderBreadcrumbs([
      { label: t('menu.home'), href: 'home.html' },
      { label: name, href: 'home.html' },
      { label: t('modules.title'), active: true }
    ]);

    try { state.modules = await getModules(state.domainId); } catch {}
    applySearch();
  }
  window.__langChangedHook = onLangChange;
  window.addEventListener('lang:changed', onLangChange);
}

init();