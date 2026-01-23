import './admin-mode.js';
import { getQuizByLesson } from './api.js';
import { qs, renderEmpty, escapeHTML } from './ui.js';
import { saveQuizResult, setLessonCompleted } from './storage.js';
import { initI18n, t } from './i18n.js';

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
  initI18n();

  state.lessonId = new URL(window.location.href).searchParams.get('lessonId') || '';
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
