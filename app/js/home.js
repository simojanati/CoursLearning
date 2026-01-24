import './admin-mode.js';
import { getDomains, getLesson } from './api.js';
import { qs, renderEmpty, escapeHTML } from './ui.js';
import { getRecentLessons, getCompletedLessons, loadJSON } from './storage.js';
import { initI18n, t, pickField } from './i18n.js';
import { ensureTopbar } from './layout.js';

const state = {
  domains: [],
  recentIds: [],
  recentById: {}, // lessonId -> lesson
};

function domainCard(domain){
  const name = pickField(domain, 'name') || domain.name || domain.domainId;
  const desc = pickField(domain, 'description') || domain.description || '';
  const icon = domain.icon || 'bx-category';
  return `
    <div class="col-12 col-md-6 col-xl-4">
      <div class="card h-100">
        <div class="card-body">
          <div class="d-flex align-items-center gap-2 mb-2">
            <span class="badge bg-label-primary"><i class="bx ${escapeHTML(icon)}"></i></span>
            <h5 class="card-title mb-0">${escapeHTML(name)}</h5>
          </div>
          <p class="card-text text-muted mb-3">${escapeHTML(desc)}</p>
          <a class="btn btn-primary" href="modules.html?domainId=${encodeURIComponent(domain.domainId)}">
            <i class="bx bx-right-arrow-alt"></i> ${escapeHTML(t('actions.openModules'))}
          </a>
        </div>
      </div>
    </div>
  `;
}

function computeDashboard(){
  const completed = getCompletedLessons(); // object map
  const completedCount = Object.keys(completed || {}).length;

  // best score across all saved quiz results
  let best = null;
  const results = loadJSON('quizResults', {});
  Object.values(results).forEach(r => {
    if (r && typeof r.score === "number") best = (best == null) ? r.score : Math.max(best, r.score);
  });

  const cEl = qs('#dashCompleted');
  const bEl = qs('#dashBestScore');
  if (cEl) cEl.textContent = String(completedCount);
  if (bEl) bEl.textContent = best == null ? "—" : `${best}%`;
}

async function setupContinue(){
  const continueBtn = qs('#continueBtn');
  const continueText = qs('#continueText');
  if (!continueBtn || !continueText) return;

  const recent = state.recentIds.length ? state.recentIds : getRecentLessons();
  if (!recent.length){
    continueBtn.classList.add('disabled');
    continueBtn.href = '#';
    continueText.textContent = '';
    return;
  }

  const lastLessonId = recent[0];
  const cached = state.recentById[lastLessonId];

  if (cached){
    continueText.textContent = pickField(cached,'title') || cached.title || lastLessonId;
    continueBtn.href = `lesson.html?lessonId=${encodeURIComponent(lastLessonId)}`;
    return;
  }

  try {
    const lesson = await getLesson(lastLessonId);
    if (lesson) state.recentById[lastLessonId] = lesson;
    const title = lesson ? (pickField(lesson,'title') || lesson.title || lastLessonId) : lastLessonId;
    continueText.textContent = title;
    continueBtn.href = `lesson.html?lessonId=${encodeURIComponent(lastLessonId)}`;
  } catch {
    continueText.textContent = lastLessonId;
    continueBtn.href = `lesson.html?lessonId=${encodeURIComponent(lastLessonId)}`;
  }
}

function renderDomains(){
  const grid = qs('#domainCards');
  const emptyCard = qs('#domainsEmptyCard');
  const empty = qs('#domainsEmpty');

  if (!grid) return;

  const list = (state.domains || []);
  if (!list.length){
    grid.innerHTML = '';
    if (emptyCard) emptyCard.classList.remove('d-none');
    renderEmpty(empty, t('home.domainsEmpty'), '');
    return;
  }
  if (emptyCard) emptyCard.classList.add('d-none');
  grid.innerHTML = list.map(domainCard).join('');
}

function renderRecent(){
  const recentList = qs('#recentLessons');
  if (!recentList) return;

  const recent = state.recentIds.length ? state.recentIds : getRecentLessons();
  if (!recent.length){
    recentList.innerHTML = '';
    return;
  }

  const items = [];
  for (const lessonId of recent.slice(0, 8)){
    const lesson = state.recentById[lessonId];
    const title = lesson ? (pickField(lesson, 'title') || lesson.title || lessonId) : lessonId;
    items.push(`
      <li class="list-group-item d-flex justify-content-between align-items-center">
        <span class="text-truncate me-3">${escapeHTML(title)}</span>
        <a class="btn btn-sm btn-outline-primary" href="lesson.html?lessonId=${encodeURIComponent(lessonId)}">
          ${escapeHTML(t('actions.view'))}
        </a>
      </li>
    `);
  }
  recentList.innerHTML = items.join('');
}

async function loadRecentLessonObjects(force = false){
  state.recentIds = getRecentLessons();
  const ids = state.recentIds.slice(0, 8);
  for (const lessonId of ids){
    if (!force && state.recentById[lessonId]) continue;
    try {
      const lesson = await getLesson(lessonId);
      if (lesson) state.recentById[lessonId] = lesson;
    } catch {}
  }
}

async function init(){
  await ensureTopbar({ showSearch: true, searchPlaceholderKey: 'topbar.search' });
initI18n();

  computeDashboard();

  // Domains
  try { state.domains = await getDomains(); }
  catch (e){
    state.domains = [];
    const empty = qs('#domainsEmpty');
    const emptyCard = qs('#domainsEmptyCard');
    if (emptyCard) emptyCard.classList.remove('d-none');
    renderEmpty(empty, t('errors.loadCourses'), String(e.message || e)); // reuse generic error key
  }
  renderDomains();

  await loadRecentLessonObjects();
  renderRecent();
  setupContinue();

  // Re-render language-dependent content immediately when language changes (no refresh)
  async function onLangChange(){
    try { state.domains = await getDomains(); } catch (e) {}
    renderDomains();

    try { await loadRecentLessonObjects(true); } catch (e) {}
    renderRecent();

    try { await setupContinue(); } catch (e) {}
  }
  window.__langChangedHook = onLangChange;
  window.addEventListener('lang:changed', onLangChange);
}

init();
