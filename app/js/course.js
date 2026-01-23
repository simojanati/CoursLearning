import './admin-mode.js';
import { getCourse, getLessons } from './api.js';
import { qs, renderEmpty, escapeHTML } from './ui.js';
import { initI18n, t, pickField } from './i18n.js';
import { isLessonCompleted } from './storage.js';

const state = {
  courseId: '',
  course: null,
  lessons: []
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
  if (!progressEl) return;
  const total = state.lessons.length;
  const completed = state.lessons.filter(l => isLessonCompleted(l.lessonId)).length;
  progressEl.textContent = `${completed}/${total}`;
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
        <td>${idx+1}</td>
        <td class="text-truncate">
          ${escapeHTML(lTitle)}
          ${done ? completedBadge() : ''}
        </td>
        <td class="text-end">
          <a class="btn btn-sm btn-primary" href="lesson.html?lessonId=${encodeURIComponent(l.lessonId)}">
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
  initI18n();

  state.courseId = new URL(window.location.href).searchParams.get('courseId') || '';
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

  if (!state.lessons.length){
    renderEmpty(empty, t('errors.loadLessons'), '');
    return;
  }

  applySearch();
  qs('#lessonSearch')?.addEventListener('input', applySearch);

  function onLangChange(){
updateHeader();
    applySearch(); // re-renders list using new language (AR UI -> FR content)
}
window.__langChangedHook = onLangChange;
window.addEventListener('lang:changed', onLangChange);
}

init();
