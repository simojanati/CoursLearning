import './admin-mode.js';
import { getCourses, getDomains, getModules } from './api.js';
import { qs, renderEmpty, escapeHTML, renderBreadcrumbs } from './ui.js';
import { initI18n, t, pickField, levelLabel } from './i18n.js';
import { ensureTopbar } from './layout.js';
import { getCourseProgress, upsertCourseMeta } from './storage.js';
import { requireAuth } from './auth.js';

const state = {
  courses: [],
  domains: [],
  modules: []
};

function i18nizeLevelOptions(){
  const levelFilter = qs('#levelFilter');
  if (!levelFilter) return;
  const opts = Array.from(levelFilter.options);
  opts.forEach(o => {
    const v = (o.value||'').toLowerCase();
    if (v === 'beginner') o.textContent = levelLabel('beginner');
    if (v === 'intermediate') o.textContent = levelLabel('intermediate');
    if (v === 'advanced') o.textContent = levelLabel('advanced');
    if (v === 'all') o.textContent = t('courses.filter.all');
  });
}

function row(c, idx){
  const title = pickField(c, 'title');
  const level = levelLabel(c.level || c.levelKey || '');
  const desc = pickField(c,'description');
  const p = getCourseProgress(c.courseId);
  const pTxt = (p && typeof p.pct === 'number' && typeof p.total === 'number')
    ? `<span class="badge bg-label-success ms-2">${escapeHTML(String(p.pct))}%</span>`
    : '';
  return `
    <tr>
      <td>
        <div class="fw-semibold">${escapeHTML(title)}${pTxt}</div>
        ${desc ? `<small class="text-muted d-block lh-wrap">${escapeHTML(desc)}</small>` : ''}
      </td>
      <td><span class="badge bg-label-secondary">${escapeHTML(level)}</span></td>
      <td class="text-end">
        <a class="btn btn-sm btn-primary" href="course.html?courseId=${encodeURIComponent(c.courseId)}">
          ${escapeHTML(t('actions.open'))}
        </a>
      </td>
    </tr>
  `;
}

function render(list){
  const tbody = qs('#coursesTbody');
  const empty = qs('#coursesEmpty');
  if (!tbody || !empty) return;

  if (!list.length){
    tbody.innerHTML = '';
    renderEmpty(empty, t('common.empty'), '');
    return;
  }
  empty.innerHTML = '';
  tbody.innerHTML = list.map((c,i)=>row(c,i)).join('');
}

function applyFilters(){
  const search = qs('#lhTopSearch');
  const levelFilter = qs('#levelFilter');
  const sortFilter = qs('#sortFilter');

  const q = (search?.value || '').toLowerCase().trim();
  const lvl = (levelFilter?.value || 'all').toLowerCase();
  const sort = (sortFilter?.value || 'order').toLowerCase();

  let list = (state.courses || []).slice();

  if (lvl !== 'all'){
    list = list.filter(c => String(c.level || c.levelKey || '').toLowerCase() === lvl);
  }

  if (q){
    list = list.filter(c => {
      const t1 = (pickField(c,'title')||'').toLowerCase();
      const d1 = (pickField(c,'description')||'').toLowerCase();
      return t1.includes(q) || d1.includes(q);
    });
  }

  if (sort === 'title'){
    list.sort((a,b) => (pickField(a,'title')||'').localeCompare((pickField(b,'title')||'')));
  } else {
    list.sort((a,b) => (Number(a.order||0) - Number(b.order||0)));
  }

  render(list);
  updateBreadcrumbs();
}

function getUrlPref(){
  const sp = new URLSearchParams(location.search);
  return {
    domainId: sp.get('domainId') || 'all',
    moduleId: sp.get('moduleId') || 'all'
  };
}


function updateBreadcrumbs(){
  const domainSel = qs('#domainFilter');
  const moduleSel = qs('#moduleFilter');
  const domainId = (domainSel?.value || getUrlPref().domainId || 'all');
  const moduleId = (moduleSel?.value || getUrlPref().moduleId || 'all');

  const bc = [{ label: t('menu.home'), href: 'home.html' }];

  if (domainId && domainId !== 'all'){
    const d = (state.domains||[]).find(x => String(x.domainId) === String(domainId));
    const domainName = d ? (pickField(d,'name') || d.domainId) : domainId;
    bc.push({ label: domainName, href: `modules.html?domainId=${encodeURIComponent(domainId)}` });

    if (moduleId && moduleId !== 'all'){
      const m = (state.modules||[]).find(x => String(x.moduleId) === String(moduleId));
      const moduleName = m ? (pickField(m,'title') || m.moduleId) : moduleId;
      bc.push({ label: moduleName, href: `courses.html?domainId=${encodeURIComponent(domainId)}&moduleId=${encodeURIComponent(moduleId)}` });
    }
  }

  bc.push({ label: t('page.courses'), active: true });
  renderBreadcrumbs(bc);
}

function rebuildDomainOptions(selected){
  const domainSel = qs('#domainFilter');
  if (!domainSel) return;
  const all = domainSel.querySelector('option[value="all"]') || (() => {
    const o=document.createElement('option'); o.value='all'; return o;
  })();
  all.textContent = t('courses.filter.all');
  domainSel.innerHTML = '';
  domainSel.appendChild(all);

  (state.domains||[]).forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.domainId;
    opt.textContent = pickField(d, 'name') || d.domainId;
    domainSel.appendChild(opt);
  });

  domainSel.value = selected || 'all';
}

function rebuildModuleOptions(selected){
  const moduleSel = qs('#moduleFilter');
  if (!moduleSel) return;
  const all = moduleSel.querySelector('option[value="all"]') || (() => {
    const o=document.createElement('option'); o.value='all'; return o;
  })();
  all.textContent = t('courses.filter.all');
  moduleSel.innerHTML = '';
  moduleSel.appendChild(all);

  (state.modules||[]).forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.moduleId;
    opt.textContent = pickField(m, 'title') || m.moduleId;
    moduleSel.appendChild(opt);
  });

  moduleSel.value = selected || 'all';
}

async function loadModulesFor(domainId){
  try {
    state.modules = await getModules(domainId && domainId !== 'all' ? domainId : '');
  } catch (e) {
    state.modules = [];
  }
}

async function loadCoursesFor(domainId, moduleId){
  try {
    state.courses = await getCourses({
      domainId: domainId || 'all',
      moduleId: moduleId || 'all'
    });

    // Save course meta mapping so other pages can aggregate progress by module/domain
    (state.courses || []).forEach(c => {
      upsertCourseMeta(c.courseId, {
        domainId: c.domainId || domainId || '',
        moduleId: c.moduleId || moduleId || ''
      });
    });
  } catch (e){
    state.courses = [];
    renderEmpty(qs('#coursesEmpty'), t('errors.loadCourses'), String(e.message || e));
  }
}

async function init(){
  requireAuth({ roles: ['student','admin'] });

  await ensureTopbar({ showSearch: true, searchPlaceholderKey: 'courses.searchPlaceholder' });
  initI18n();
  i18nizeLevelOptions();

  // Load domains (optional)
  try {
    state.domains = await getDomains();
  } catch (e) {
    state.domains = [];
  }

  const domainSel = qs('#domainFilter');
  const moduleSel = qs('#moduleFilter');
  const rowEl = qs('#domainModuleRow');
  const pref = getUrlPref();

  if (!state.domains || state.domains.length === 0) {
    if (rowEl) rowEl.style.display = 'none';
    await loadCoursesFor('all','all');
  } else {
    if (rowEl) rowEl.style.display = '';
    rebuildDomainOptions(pref.domainId);

    await loadModulesFor(domainSel?.value || 'all');
    rebuildModuleOptions(pref.moduleId);

    await loadCoursesFor(domainSel?.value || 'all', moduleSel?.value || 'all');

    domainSel?.addEventListener('change', async () => {
      await loadModulesFor(domainSel.value);
      rebuildModuleOptions('all');
      await loadCoursesFor(domainSel.value, 'all');
      applyFilters();
    });

    moduleSel?.addEventListener('change', async () => {
      await loadCoursesFor(domainSel?.value || 'all', moduleSel.value);
      applyFilters();
    });
  }

  applyFilters();

  qs('#lhTopSearch')?.addEventListener('input', applyFilters);
  qs('#levelFilter')?.addEventListener('change', applyFilters);
  qs('#sortFilter')?.addEventListener('change', applyFilters);

  async function onLangChange(){
    i18nizeLevelOptions();

    const curDomain = domainSel?.value || 'all';
    const curModule = moduleSel?.value || 'all';

    // No API reload needed: data objects contain multilingual fields.
    rebuildDomainOptions(curDomain);
    rebuildModuleOptions(curModule);
    applyFilters();
  }
  window.__langChangedHook = onLangChange;
  window.addEventListener('lang:changed', onLangChange);
}

init();