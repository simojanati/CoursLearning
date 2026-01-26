import './admin-mode.js';
import { getCourse, getLessons, getDomains, getModules } from './api.js';
import { qs, renderEmpty, escapeHTML, renderBreadcrumbs } from './ui.js';
import { initI18n, t, pickField } from './i18n.js';
import { isLessonCompleted, saveCourseProgress, upsertCourseMeta, getRecentLessons } from './storage.js';
import { ensureTopbar } from './layout.js';
import { requireAuth } from './auth.js';

const state = {
  courseId: '',
  domainId: '',
  moduleId: '',
  course: null,
  lessons: [],
  domains: [],
  modules: []
};

function completedBadge(){
  return `<span class="badge bg-label-success ms-2">${escapeHTML(t('lesson.done'))}</span>`;
}

function updateHeader(){
  const titleEl = qs('#courseTitle');
  const descEl = qs('#courseDesc');
  if (titleEl) titleEl.textContent = state.course ? (pickField(state.course,'title') || '') : '';
  if (descEl) descEl.textContent = state.course ? (pickField(state.course,'description') || '') : '';
}

function updateProgress(){
  const progressEl = qs('#courseProgress');
  const badgeTop = qs('#courseProgressBadgeTop');
  if (!progressEl) return;
  const total = state.lessons.length;
  const completed = state.lessons.filter(l => isLessonCompleted(l.lessonId)).length;
  progressEl.textContent = `${completed}/${total}`;

  if (badgeTop){
    const pct = total > 0 ? Math.round((completed/total)*100) : 0;
    badgeTop.textContent = `${t('course.progress')}: ${pct}%`;
  }

  // Persist aggregate so Courses/Modules/Home can show progress instantly
  saveCourseProgress(state.courseId, completed, total, {
    domainId: state.domainId || state.course?.domainId || '',
    moduleId: state.moduleId || state.course?.moduleId || ''
  });
}

function setupResumeButton(){
  const btn = qs('#resumeCourseBtn');
  const label = qs('#resumeCourseLabel');
  if (!btn || !label) return;

  const list = state.lessons || [];
  if (!list.length){
    btn.classList.add('disabled');
    btn.href = '#';
    label.textContent = '';
    return;
  }

  // Prefer first not-completed lesson
  let target = list.find(l => !isLessonCompleted(l.lessonId));

  // Otherwise, use last visited lesson within this course
  if (!target){
    const recent = getRecentLessons();
    const set = new Set(list.map(l => String(l.lessonId)));
    const hit = recent.find(id => set.has(String(id)));
    if (hit) target = list.find(l => String(l.lessonId) === String(hit)) || null;
  }

  if (!target) target = list[0];

  const title = pickField(target,'title') || target.title || target.lessonId;
  label.textContent = title;
  btn.classList.remove('disabled');
  btn.href = `lesson.html?lessonId=${encodeURIComponent(target.lessonId)}&courseId=${encodeURIComponent(state.courseId)}&domainId=${encodeURIComponent(state.domainId||'')}&moduleId=${encodeURIComponent(state.moduleId||'')}`;
}

function renderLessons(list){
  const tbody = qs('#lessonsTbody');
  const empty = qs('#courseEmpty');
  if (!tbody || !empty) return;

  if (!list.length){
    tbody.innerHTML = '';
    renderEmpty(empty, t('common.empty'), '');
    return;
  }
  empty.innerHTML = '';

  tbody.innerHTML = list.map((l, idx) => {
    const lTitle = pickField(l,'title') || l.title || l.lessonId;
    const done = isLessonCompleted(l.lessonId);
    return `
      <tr>
        <td class="lh-wrap">
          ${escapeHTML(lTitle)}
          ${done ? completedBadge() : ''}
        </td>
        <td class="text-end">
          <a class="btn btn-sm btn-primary" href="lesson.html?lessonId=${encodeURIComponent(l.lessonId)}&courseId=${encodeURIComponent(state.courseId)}&domainId=${encodeURIComponent(state.domainId||"")}&moduleId=${encodeURIComponent(state.moduleId||"")}">
            ${escapeHTML(t('actions.open'))}
          </a>
        </td>
      </tr>
    `;
  }).join('');
}

function applySearch(){
  const lessonSearch = qs('#lessonSearch');
  const q = (lessonSearch?.value || '').toLowerCase().trim();

  let list = state.lessons.slice();
  if (q){
    list = list.filter(l => {
      const title = (pickField(l,'title') || l.title || '').toLowerCase();
      return title.includes(q);
    });
  }
  renderLessons(list);
  updateProgress();
}

async function init(){
  requireAuth({ roles: ['student','admin'] });

  await ensureTopbar({ showSearch: true, searchPlaceholderKey: 'topbar.search' });
initI18n();

  const sp = new URL(window.location.href).searchParams;
  state.courseId = sp.get('courseId') || '';
  state.domainId = sp.get('domainId') || '';
  state.moduleId = sp.get('moduleId') || '';

  const empty = qs('#courseEmpty');

  if (!state.courseId){
    renderEmpty(empty, t('common.empty'), '');
    return;
  }

  try {
    state.course = await getCourse(state.courseId);
    state.lessons = await getLessons(state.courseId);
  } catch (e){
    renderEmpty(empty, t('errors.loadCourse'), String(e.message || e));
    return;
  }

  if (!state.course){
    renderEmpty(empty, t('common.empty'), '');
    return;
  }

  updateHeader();

  // Save meta mapping for this course
  upsertCourseMeta(state.courseId, {
    domainId: state.domainId || state.course?.domainId || '',
    moduleId: state.moduleId || state.course?.moduleId || ''
  });

  // Back button preserves filters when coming from Modules/Courses
  const backBtn = qs('#backToCoursesBtn');
  if (backBtn){
    const qsPart = [];
    if (state.domainId) qsPart.push(`domainId=${encodeURIComponent(state.domainId)}`);
    if (state.moduleId) qsPart.push(`moduleId=${encodeURIComponent(state.moduleId)}`);
    backBtn.href = qsPart.length ? `courses.html?${qsPart.join('&')}` : 'courses.html';
  }

  // Breadcrumbs
  try { state.domains = await getDomains(); } catch { state.domains = []; }
  if (state.domainId){
    try { state.modules = await getModules(state.domainId); } catch { state.modules = []; }
  }
  const domain = state.domainId ? state.domains.find(d => String(d.domainId) === String(state.domainId)) : null;
  const module = state.moduleId ? state.modules.find(m => String(m.moduleId) === String(state.moduleId)) : null;
  const domainName = domain ? (pickField(domain,'name') || domain.domainId) : (state.domainId || '');
  const moduleName = module ? (pickField(module,'title') || module.moduleId) : (state.moduleId || '');
  const courseName = state.course ? (pickField(state.course,'title') || '') : '';

  const bc = [{ label: t('menu.home'), href: 'home.html' }];
  if (domainName) bc.push({ label: domainName, href: `modules.html?domainId=${encodeURIComponent(state.domainId)}` });
  if (moduleName) bc.push({ label: moduleName, href: `courses.html?domainId=${encodeURIComponent(state.domainId)}&moduleId=${encodeURIComponent(state.moduleId)}` });
  bc.push({ label: courseName || t('page.course'), active: true });
  renderBreadcrumbs(bc);


  if (!state.lessons.length){
    renderEmpty(empty, t('errors.loadLessons'), '');
    return;
  }

  applySearch();
  qs('#lessonSearch')?.addEventListener('input', applySearch);
  setupResumeButton();

  function onLangChange(){
    updateHeader();
    applySearch(); // re-renders list using new language (AR UI -> FR content)
    setupResumeButton();

    const domain = state.domainId ? state.domains.find(d => String(d.domainId) === String(state.domainId)) : null;
    const module = state.moduleId ? state.modules.find(m => String(m.moduleId) === String(state.moduleId)) : null;
    const domainName = domain ? (pickField(domain,'name') || domain.domainId) : (state.domainId || '');
    const moduleName = module ? (pickField(module,'title') || module.moduleId) : (state.moduleId || '');
    const courseName = state.course ? (pickField(state.course,'title') || '') : '';

    const bc = [{ label: t('menu.home'), href: 'home.html' }];
    if (domainName) bc.push({ label: domainName, href: `modules.html?domainId=${encodeURIComponent(state.domainId)}` });
    if (moduleName) bc.push({ label: moduleName, href: `courses.html?domainId=${encodeURIComponent(state.domainId)}&moduleId=${encodeURIComponent(state.moduleId)}` });
    bc.push({ label: courseName || t('page.course'), active: true });
    renderBreadcrumbs(bc);
}
window.__langChangedHook = onLangChange;
window.addEventListener('lang:changed', onLangChange);
}

init();