import './admin-mode.js';
import { initI18n, t } from './i18n.js';
import { pickField } from './i18n.js';
import { loadJSON, saveJSON, getLang, setLang } from './storage.js';
import { getAllCourseProgress, getAllCourseMeta, getCompletedLessons, getLastVisitedLesson } from './storage.js';
import { getHealth, getCourses, getLesson } from './api.js';
import { escapeHTML } from './ui.js';
import { ensureTopbar } from './layout.js';

// Note: Export/import supports both the new "progress" format and older legacy keys.

function getAllState(){
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      lang: getLang('fr'),
      recentLessons: loadJSON('recentLessons', []),
      progress: loadJSON('progress', {}),
      quizResults: loadJSON('quizResults', {})
    }
  };
}

function downloadJSON(obj){
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vba-eco-progress-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function parseImport(text){
  const obj = JSON.parse(text);
  if (!obj || typeof obj !== 'object') throw new Error('invalid');
  const data = obj.data || obj;
  // accept both formats (with wrapper or raw)
  const recent = data.recentLessons || [];
  const rawProgress = data.progress || null;
  const legacyCompleted = data.completedLessons || {};
  const quiz = data.quizResults || {};

  // Normalize to the new progress format: { lessonId: { completed: true, updatedAt, score? } }
  let progress = {};
  if (rawProgress && typeof rawProgress === 'object'){
    progress = rawProgress;
  } else if (legacyCompleted && typeof legacyCompleted === 'object'){
    // legacy map: { lessonId: true }
    const now = new Date().toISOString();
    Object.keys(legacyCompleted).forEach(id => {
      if (legacyCompleted[id]) progress[String(id)] = { completed: true, updatedAt: now };
    });
  }
  return {
    lang: data.lang,
    recentLessons: Array.isArray(recent) ? recent : [],
    progress: (progress && typeof progress === 'object') ? progress : {},
    quizResults: (quiz && typeof quiz === 'object') ? quiz : {}
  };
}

function mergeState(current, incoming){
  // recent: incoming first, keep unique, cap 10
  const recent = [...incoming.recentLessons, ...current.recentLessons]
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 10);

  // progress: keep any completed; merge timestamps (prefer most recent)
  const progress = { ...(current.progress||{}) };
  Object.entries(incoming.progress||{}).forEach(([lessonId, val]) => {
    const a = progress[String(lessonId)];
    const b = val;
    const aAt = a?.updatedAt ? Date.parse(a.updatedAt) : 0;
    const bAt = b?.updatedAt ? Date.parse(b.updatedAt) : 0;
    if (!a) {
      progress[String(lessonId)] = b;
      return;
    }
    // Ensure completed stays true if either is completed
    const completed = Boolean(a?.completed) || Boolean(b?.completed);
    const merged = { ...(a || {}), ...(b || {}) };
    merged.completed = completed;
    // Prefer newer updatedAt
    if (bAt > aAt) merged.updatedAt = b.updatedAt;
    progress[String(lessonId)] = merged;
  });

  // quizResults: keep best score per lessonId
  const quiz = { ...(current.quizResults||{}) };
  Object.keys(incoming.quizResults||{}).forEach(lessonId => {
    const a = quiz[lessonId];
    const b = incoming.quizResults[lessonId];
    const aScore = a && typeof a.score === 'number' ? a.score : null;
    const bScore = b && typeof b.score === 'number' ? b.score : null;
    if (aScore == null) quiz[lessonId] = b;
    else if (bScore != null && bScore > aScore) quiz[lessonId] = b;
  });

  return { recentLessons: recent, progress, quizResults: quiz };
}

function setStatus(type, msgKey){
  const box = document.getElementById('statusBox');
  const text = document.getElementById('statusText');
  if (!box || !text) return;

  box.classList.remove('alert-info','alert-success','alert-warning','alert-danger');
  box.classList.add(type);

  text.textContent = t(msgKey);
}

async function readFileAsText(file){
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result || ''));
    r.onerror = () => rej(r.error || new Error('read'));
    r.readAsText(file);
  });
}

function resetProgress(){
  saveJSON('recentLessons', []);
  saveJSON('progress', {});
  saveJSON('quizResults', {});
  saveJSON('courseProgress', {});
  saveJSON('courseMeta', {});
}

// ---------------- Dashboard ----------------
const dashboardCache = {
  health: null,
  courses: null,
  lastLessonId: null,
  lastLesson: null
};

function _sumCourseTotals(courseProgress){
  let total = 0;
  Object.values(courseProgress || {}).forEach(p => { total += Number(p?.total || 0); });
  return total;
}

function _sumCourseDone(courseProgress){
  let done = 0;
  Object.values(courseProgress || {}).forEach(p => { done += Number(p?.done || 0); });
  return done;
}

function renderOverall(){
  const pctEl = document.getElementById('overallPct');
  const countsEl = document.getElementById('overallCounts');
  const barEl = document.getElementById('overallBar');
  const noteEl = document.getElementById('overallNote');

  const completed = getCompletedLessons().length;
  const courseProgress = getAllCourseProgress();
  const healthTotal = dashboardCache.health?.counts?.lessons;
  const total = Number(healthTotal || 0) || _sumCourseTotals(courseProgress);
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  if (pctEl) pctEl.textContent = `${pct}%`;
  if (countsEl) countsEl.textContent = `${completed}/${total || 0}`;
  if (barEl){
    barEl.style.width = `${pct}%`;
    barEl.setAttribute('aria-valuenow', String(pct));
  }

  if (noteEl){
    // If we don't have health totals yet, explain that totals are based on tracked courses.
    const hasHealth = Boolean(Number(healthTotal || 0));
    noteEl.textContent = hasHealth ? t('progress.overallNote') : t('progress.overallNoteTracked');
  }
}

function renderContinue(){
  const titleEl = document.getElementById('lastLessonTitle');
  const metaEl = document.getElementById('lastLessonMeta');
  const btn = document.getElementById('continueBtn');
  const noBox = document.getElementById('noActivityBox');

  const lesson = dashboardCache.lastLesson;
  if (!lesson){
    if (titleEl) titleEl.textContent = '—';
    if (metaEl) metaEl.textContent = '';
    if (btn) {
      btn.classList.add('disabled');
      btn.setAttribute('aria-disabled', 'true');
      btn.href = '#';
    }
    noBox?.classList.remove('d-none');
    return;
  }
  noBox?.classList.add('d-none');

  const title = pickField(lesson,'title') || lesson.title || lesson.lessonId;
  if (titleEl) titleEl.textContent = title;

  // Meta: courseId if present
  const courseId = lesson.courseId || '';
  if (metaEl){
    metaEl.textContent = courseId ? `${t('progress.courseLabel')}: ${courseId}` : '';
  }

  if (btn){
    btn.classList.remove('disabled');
    btn.removeAttribute('aria-disabled');
    const qs = new URLSearchParams();
    qs.set('lessonId', String(lesson.lessonId));
    if (courseId) qs.set('courseId', String(courseId));
    btn.href = `lesson.html?${qs.toString()}`;
  }
}

function renderTopCourses(){
  const listEl = document.getElementById('topCoursesList');
  const emptyEl = document.getElementById('topCoursesEmpty');
  if (!listEl || !emptyEl) return;

  const progress = getAllCourseProgress();
  const entries = Object.entries(progress || {}).map(([courseId, p]) => ({
    courseId,
    done: Number(p?.done || 0),
    total: Number(p?.total || 0),
    pct: Number(p?.pct || 0),
    updatedAt: p?.updatedAt || ''
  })).filter(e => e.total > 0);

  if (!entries.length){
    listEl.innerHTML = '';
    emptyEl.classList.remove('d-none');
    return;
  }
  emptyEl.classList.add('d-none');

  // Map courseId -> title for current content language
  const courses = dashboardCache.courses || [];
  const titleById = new Map(courses.map(c => [String(c.courseId), (pickField(c,'title') || c.title || c.courseId)]));

  // Sort by pct desc, then updatedAt desc, then done desc
  entries.sort((a,b) => {
    if (b.pct !== a.pct) return b.pct - a.pct;
    if (String(b.updatedAt) !== String(a.updatedAt)) return String(b.updatedAt).localeCompare(String(a.updatedAt));
    return b.done - a.done;
  });

  const top = entries.slice(0, 3);
  listEl.innerHTML = `
    <div class="list-group list-group-flush">
      ${top.map(e => {
        const title = titleById.get(String(e.courseId)) || e.courseId;
        const url = `course.html?courseId=${encodeURIComponent(e.courseId)}`;
        return `
          <a href="${url}" class="list-group-item list-group-item-action d-flex align-items-start justify-content-between gap-3">
            <div class="flex-grow-1">
              <div class="fw-semibold lh-sm">${escapeHTML(title)}</div>
              <div class="small text-muted">${escapeHTML(String(e.done))}/${escapeHTML(String(e.total))}</div>
              <div class="progress mt-2" style="height: 6px;">
                <div class="progress-bar" role="progressbar" style="width: ${Math.min(100, Math.max(0, e.pct))}%" aria-valuemin="0" aria-valuemax="100"></div>
              </div>
            </div>
            <span class="badge bg-label-primary">${escapeHTML(String(e.pct))}%</span>
          </a>
        `;
      }).join('')}
    </div>
  `;
}

async function loadDashboardData(){
  // Only 1 health call
  if (!dashboardCache.health){
    try { dashboardCache.health = await getHealth(); } catch { dashboardCache.health = null; }
  }
  // Only 1 courses call
  if (!dashboardCache.courses){
    try { dashboardCache.courses = await getCourses({}); } catch { dashboardCache.courses = []; }
  }
  // Last visited lesson (single call, cached by lessonId)
  const lastId = getLastVisitedLesson();
  if (lastId && dashboardCache.lastLessonId !== String(lastId)){
    dashboardCache.lastLessonId = String(lastId);
    try { dashboardCache.lastLesson = await getLesson(String(lastId)); } catch { dashboardCache.lastLesson = null; }
  }
  if (!lastId){
    dashboardCache.lastLessonId = null;
    dashboardCache.lastLesson = null;
  }
}

async function renderDashboard({ refreshData = false } = {}){
  if (refreshData){
    dashboardCache.health = null;
    dashboardCache.courses = null;
  }
  await loadDashboardData();
  renderOverall();
  renderContinue();
  renderTopCourses();
}

async function init(){
  await ensureTopbar({ showSearch: true, searchPlaceholderKey: 'topbar.search' });
initI18n();

  // Render dashboard once; on language change, re-render labels without re-fetching.
  await renderDashboard();
  window.addEventListener('lang:changed', () => {
    // No re-fetch: only re-render with new i18n labels/titles.
    renderDashboard({ refreshData: false });
  });

  const exportBtn = document.getElementById('exportBtn');
  const importBtn = document.getElementById('importBtn');
  const resetBtn = document.getElementById('resetBtn');
  const importFile = document.getElementById('importFile');
  const importText = document.getElementById('importText');
  const modeMerge = document.getElementById('modeMerge');
  const importLang = document.getElementById('importLang');

  exportBtn?.addEventListener('click', () => {
    try {
      const state = getAllState();
      downloadJSON(state);
      setStatus('alert-success', 'progress.status.exportOk');
    } catch {
      setStatus('alert-danger', 'progress.status.error');
    }
  });

  resetBtn?.addEventListener('click', () => {
    resetProgress();
    setStatus('alert-success', 'progress.status.importOk');
  });

  importBtn?.addEventListener('click', async () => {
    try {
      let text = (importText?.value || '').trim();
      if (!text && importFile?.files?.length){
        text = (await readFileAsText(importFile.files[0])).trim();
      }
      if (!text){
        setStatus('alert-warning', 'progress.status.invalid');
        return;
      }

      const incoming = parseImport(text);

      const current = {
        recentLessons: loadJSON('recentLessons', []),
        progress: loadJSON('progress', {}),
        quizResults: loadJSON('quizResults', {})
      };

      const replace = !(modeMerge?.checked);
      if (replace){
        saveJSON('recentLessons', incoming.recentLessons.slice(0,10));
        saveJSON('progress', incoming.progress);
        saveJSON('quizResults', incoming.quizResults);
      } else {
        const merged = mergeState(current, incoming);
        saveJSON('recentLessons', merged.recentLessons);
        saveJSON('progress', merged.progress);
        saveJSON('quizResults', merged.quizResults);
      }

      if (importLang?.checked && incoming.lang){
        setLang(incoming.lang);
      }

      setStatus('alert-success', 'progress.status.importOk');
    } catch (e){
      setStatus('alert-danger', 'progress.status.error');
    }
  });

  setStatus('alert-info', 'progress.status.ready');
}

init();
