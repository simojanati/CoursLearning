import './admin-mode.js';
import { getQuizByLesson, getLesson, getCourse, getDomains, getModules } from './api.js';
import { qs, renderEmpty, escapeHTML, renderBreadcrumbs } from './ui.js';
import { saveQuizResult, setLessonCompleted } from './storage.js';
import { initI18n, t } from './i18n.js';
import { ensureTopbar } from './layout.js';

const state = {
  lessonId: '',
  quiz: null,
};

function dataLang(){
  const l = document.documentElement.lang || 'fr';
  return (l === 'ar') ? 'fr' : l; // content is FR/EN only
}
function getField(obj, base){
  const lang = dataLang();
  const key = `${base}_${lang}`;
  return (obj && obj[key] != null && obj[key] !== '') ? obj[key] : (obj && obj[base] ? obj[base] : '');
}
function getChoices(q){
  const lang = dataLang();
  const v = q[`choices_${lang}`] || q.choices || [];
  if (Array.isArray(v)) return v;
  if (typeof v === 'string'){
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
    return v.split('|').map(s => s.trim()).filter(Boolean);
  }
  return [];
}

function snapshotAnswers(questions){
  const snap = {};
  questions.forEach((_, idx) => {
    const selected = document.querySelector(`input[name="q_${idx}"]:checked`);
    if (selected) snap[idx] = String(selected.value);
  });
  return snap;
}
function restoreAnswers(answers){
  Object.keys(answers || {}).forEach(idx => {
    const val = answers[idx];
    const el = document.querySelector(`input[name="q_${idx}"][value="${val}"]`);
    if (el) el.checked = true;
  });
}

function renderQuiz(){
  const titleEl = qs('#quizTitle');
  const emptyEl = qs('#quizEmpty');
  if (!state.lessonId){
    renderEmpty(emptyEl, t('common.empty'), '');
    return;
  }

  // Load names for breadcrumbs (best-effort)
  try { state.lesson = await getLesson(state.lessonId); } catch { state.lesson = null; }
  if (state.courseId){
    try { state.course = await getCourse(state.courseId); } catch { state.course = null; }
  }
  try { state.domains = await getDomains(); } catch { state.domains = []; }
  if (state.domainId){
    try { state.modules = await getModules(state.domainId); } catch { state.modules = []; }
  }

  // Back button to lesson
  const backBtn = qs('#backToLessonBtn');
  if (backBtn){
    const qsPart = [`lessonId=${encodeURIComponent(state.lessonId)}`];
    if (state.courseId) qsPart.push(`courseId=${encodeURIComponent(state.courseId)}`);
    if (state.domainId) qsPart.push(`domainId=${encodeURIComponent(state.domainId)}`);
    if (state.moduleId) qsPart.push(`moduleId=${encodeURIComponent(state.moduleId)}`);
    backBtn.href = `lesson.html?${qsPart.join('&')}`;
  }

  const domain = state.domainId ? state.domains.find(d => String(d.domainId) === String(state.domainId)) : null;
  const module = state.moduleId ? state.modules.find(m => String(m.moduleId) === String(state.moduleId)) : null;
  const domainName = domain ? (pickField(domain,'name') || domain.domainId) : (state.domainId || '');
  const moduleName = module ? (pickField(module,'title') || module.moduleId) : (state.moduleId || '');
  const courseName = state.course ? (pickField(state.course,'title') || '') : '';
  const lessonName = state.lesson ? (pickField(state.lesson,'title') || state.lesson.title || '') : '';

  const bc = [{ label: t('menu.home'), href: 'home.html' }];
  if (domainName) bc.push({ label: domainName, href: `modules.html?domainId=${encodeURIComponent(state.domainId)}` });
  if (moduleName) bc.push({ label: moduleName, href: `courses.html?domainId=${encodeURIComponent(state.domainId)}&moduleId=${encodeURIComponent(state.moduleId)}` });
  if (state.courseId) bc.push({ label: courseName || t('page.course'), href: `course.html?courseId=${encodeURIComponent(state.courseId)}&domainId=${encodeURIComponent(state.domainId||'')}&moduleId=${encodeURIComponent(state.moduleId||'')}` });
  bc.push({ label: lessonName || t('page.lesson'), href: `lesson.html?lessonId=${encodeURIComponent(state.lessonId)}&courseId=${encodeURIComponent(state.courseId||'')}&domainId=${encodeURIComponent(state.domainId||'')}&moduleId=${encodeURIComponent(state.moduleId||'')}` });
  bc.push({ label: t('page.quiz'), active: true });
  renderBreadcrumbs(bc);

  const questionsEl = qs('#quizQuestions');

  if (!state.quiz){
    renderEmpty(emptyEl, t('common.empty'), '');
    return;
  }

  const quiz = state.quiz;
  const questions = quiz.questions || [];

  titleEl.textContent = getField(quiz,'title') || t('quiz.title');

  if (!questions.length){
    renderEmpty(emptyEl, t('common.empty'), '');
    return;
  }

  emptyEl.innerHTML = '';

  questionsEl.innerHTML = questions.map((q, idx) => {
    const qText = getField(q,'question') || '';
    const choices = getChoices(q);
    const name = `q_${idx}`;
    return `
      <div class="mb-4">
        <div class="fw-semibold mb-2">${idx+1}. ${escapeHTML(qText)}</div>
        ${choices.map((c,i)=>`
          <div class="form-check">
            <input class="form-check-input" type="radio" name="${name}" id="${name}_${i}" value="${i}">
            <label class="form-check-label" for="${name}_${i}">${escapeHTML(c)}</label>
          </div>
        `).join('')}
        <div class="text-muted small mt-2 d-none" id="exp_${idx}"></div>
      </div>
    `;
  }).join('');
}

function bindSubmit(){
  const submitBtn = qs('#submitQuiz');
  if (!submitBtn || submitBtn.__bound) return;
  submitBtn.__bound = true;

  submitBtn.addEventListener('click', () => {
    const quiz = state.quiz;
    if (!quiz) return;

    const questions = quiz.questions || [];
    let correct = 0;

    questions.forEach((q, idx) => {
      const selected = document.querySelector(`input[name="q_${idx}"]:checked`);
      const val = selected ? Number(selected.value) : -1;
      const okIndex = (q.correctIndex ?? q.correct ?? -1);
      if (val === okIndex) correct++;

      const exp = document.getElementById(`exp_${idx}`);
      if (exp){
        const expText = getField(q,'explanation') || '';
        if (expText){
          exp.textContent = expText;
          exp.classList.remove('d-none');
        }
      }
    });

    const score = Math.round((correct / questions.length) * 100);
    qs('#quizScore').textContent = `${score}%`;

    const passing = (quiz.passingScore || 0);
    const passed = score >= passing;

    qs('#quizResultText').textContent = passed ? t('quiz.passed') : t('quiz.failed');

    const result = qs('#quizResult');
    result.classList.remove('d-none');
    result.classList.toggle('alert-success', passed);
    result.classList.toggle('alert-warning', !passed);

    // Save best score
    const prev = JSON.parse(localStorage.getItem("quizResults") || "{}")[String(state.lessonId)];
    const best = (prev && typeof prev.score === "number") ? Math.max(prev.score, score) : score;

    saveQuizResult(state.lessonId, { score: best, lastScore: score, correct, total: questions.length, at: Date.now() });

    if (passed){
      setLessonCompleted(state.lessonId, true);
    }
  });
}

async function init(){
  await ensureTopbar({ showSearch: true, searchPlaceholderKey: 'topbar.search' });
initI18n();

  const sp = new URL(window.location.href).searchParams;
  state.lessonId = sp.get('lessonId') || '';
  state.courseId = sp.get('courseId') || '';
  state.domainId = sp.get('domainId') || '';
  state.moduleId = sp.get('moduleId') || '';

  const emptyEl = qs('#quizEmpty');

  try { state.quiz = await getQuizByLesson(state.lessonId); }
  catch (e){
    renderEmpty(emptyEl, t('errors.loadQuiz'), String(e.message || e));
    return;
  }

  if (!state.quiz){
    renderEmpty(emptyEl, t('common.empty'), '');
    return;
  }

  renderQuiz();
  bindSubmit();

  function onLangChange(){
    // Update breadcrumbs labels
    const domain = state.domainId ? state.domains.find(d => String(d.domainId) === String(state.domainId)) : null;
    const module = state.moduleId ? state.modules.find(m => String(m.moduleId) === String(state.moduleId)) : null;
    const domainName = domain ? (pickField(domain,'name') || domain.domainId) : (state.domainId || '');
    const moduleName = module ? (pickField(module,'title') || module.moduleId) : (state.moduleId || '');
    const courseName = state.course ? (pickField(state.course,'title') || '') : '';
    const lessonName = state.lesson ? (pickField(state.lesson,'title') || state.lesson.title || '') : '';
    const bc = [{ label: t('menu.home'), href: 'home.html' }];
    if (domainName) bc.push({ label: domainName, href: `modules.html?domainId=${encodeURIComponent(state.domainId)}` });
    if (moduleName) bc.push({ label: moduleName, href: `courses.html?domainId=${encodeURIComponent(state.domainId)}&moduleId=${encodeURIComponent(state.moduleId)}` });
    if (state.courseId) bc.push({ label: courseName || t('page.course'), href: `course.html?courseId=${encodeURIComponent(state.courseId)}&domainId=${encodeURIComponent(state.domainId||'')}&moduleId=${encodeURIComponent(state.moduleId||'')}` });
    bc.push({ label: lessonName || t('page.lesson'), href: `lesson.html?lessonId=${encodeURIComponent(state.lessonId)}&courseId=${encodeURIComponent(state.courseId||'')}&domainId=${encodeURIComponent(state.domainId||'')}&moduleId=${encodeURIComponent(state.moduleId||'')}` });
    bc.push({ label: t('page.quiz'), active: true });
    renderBreadcrumbs(bc);

// preserve current answers when switching language
    const questions = state.quiz?.questions || [];
    const snap = snapshotAnswers(questions);

    // rerender content in the new language (AR UI -> FR content)
    renderQuiz();
    restoreAnswers(snap);

    // update result labels (if already shown)
    const result = qs('#quizResult');
    if (result && !result.classList.contains('d-none')){
      // keep same pass/fail state but update localized text
      const scoreTxt = qs('#quizScore')?.textContent || '';
      const score = Number(String(scoreTxt).replace('%','')) || 0;
      const passing = (state.quiz?.passingScore || 0);
      const passed = score >= passing;
      qs('#quizResultText').textContent = passed ? t('quiz.passed') : t('quiz.failed');
    }
}
window.__langChangedHook = onLangChange;
window.addEventListener('lang:changed', onLangChange);
}

init();
