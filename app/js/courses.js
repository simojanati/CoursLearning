import './admin-mode.js';
import { getCourses } from './api.js';
import { qs, renderEmpty, escapeHTML } from './ui.js';
import { initI18n, t, pickField, levelLabel } from './i18n.js';

const state = {
  courses: []
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
  return `
    <tr>
      <td>${idx+1}</td>
      <td>
        <div class="fw-semibold">${escapeHTML(title)}</div>
        <small class="text-muted d-block text-truncate" style="max-width:520px">${escapeHTML(pickField(c,'description'))}</small>
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
  const search = qs('#courseSearch');
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
}

async function init(){
  initI18n();
  i18nizeLevelOptions();

  try { state.courses = await getCourses(); }
  catch (e){
    renderEmpty(qs('#coursesEmpty'), t('errors.loadCourses'), String(e.message || e));
    return;
  }

  applyFilters();

  qs('#courseSearch')?.addEventListener('input', applyFilters);
  qs('#levelFilter')?.addEventListener('change', applyFilters);
  qs('#sortFilter')?.addEventListener('change', applyFilters);

  function onLangChange(){
i18nizeLevelOptions();
    applyFilters();
}
window.__langChangedHook = onLangChange;
window.addEventListener('lang:changed', onLangChange);
}

init();
