import './admin-mode.js';
import { initI18n, t } from './i18n.js';
import { loadJSON, saveJSON, getLang, setLang } from './storage.js';

const KEYS = ['recentLessons','completedLessons','quizResults','adminMode'];

function nsKey(k){ return `vbaEco:${k}`; }

function getAllState(){
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      lang: getLang('fr'),
      recentLessons: loadJSON('recentLessons', []),
      completedLessons: loadJSON('completedLessons', {}),
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
  const completed = data.completedLessons || {};
  const quiz = data.quizResults || {};
  return {
    lang: data.lang,
    recentLessons: Array.isArray(recent) ? recent : [],
    completedLessons: (completed && typeof completed === 'object') ? completed : {},
    quizResults: (quiz && typeof quiz === 'object') ? quiz : {}
  };
}

function mergeState(current, incoming){
  // recent: incoming first, keep unique, cap 10
  const recent = [...incoming.recentLessons, ...current.recentLessons]
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 10);

  // completed: OR (keep any completed)
  const completed = { ...(current.completedLessons||{}) };
  Object.keys(incoming.completedLessons||{}).forEach(k => {
    if (incoming.completedLessons[k]) completed[k] = incoming.completedLessons[k];
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

  return { recentLessons: recent, completedLessons: completed, quizResults: quiz };
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
  saveJSON('completedLessons', {});
  saveJSON('quizResults', {});
}

async function init(){
  initI18n();

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
        completedLessons: loadJSON('completedLessons', {}),
        quizResults: loadJSON('quizResults', {})
      };

      const replace = !(modeMerge?.checked);
      if (replace){
        saveJSON('recentLessons', incoming.recentLessons.slice(0,10));
        saveJSON('completedLessons', incoming.completedLessons);
        saveJSON('quizResults', incoming.quizResults);
      } else {
        const merged = mergeState(current, incoming);
        saveJSON('recentLessons', merged.recentLessons);
        saveJSON('completedLessons', merged.completedLessons);
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
