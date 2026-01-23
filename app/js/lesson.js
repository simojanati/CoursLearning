import { getLesson, getQuizByLesson } from './api.js';
import { qs, renderEmpty, setHTML, escapeHTML } from './ui.js';
import { markLessonVisited, setLessonCompleted, isLessonCompleted } from './storage.js';
import { initI18n, t, pickField } from './i18n.js';

const state = {
  lessonId: '',
  lesson: null,
  hasQuiz: false
};

function updateDoneUI(isDone){
  const btn = qs('#markDoneBtn');
  const badge = qs('#lessonDoneBadge');
  if (btn){
    btn.classList.toggle('btn-outline-success', !isDone);
    btn.classList.toggle('btn-success', isDone);
    const span = btn.querySelector('span');
    if (span) span.textContent = isDone ? t('lesson.done') : t('lesson.markDone');
  }
  if (badge){
    badge.classList.toggle('d-none', !isDone);
    badge.textContent = t('lesson.done');
  }
}

function normalizeUrl(u){ return String(u || '').trim(); }

function youtubeId(url){
  const u = normalizeUrl(url);
  let m = u.match(/youtu\.be\/([a-zA-Z0-9_-]{6,})/);
  if (m) return m[1];
  m = u.match(/[?&]v=([a-zA-Z0-9_-]{6,})/);
  if (m) return m[1];
  m = u.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{6,})/);
  if (m) return m[1];
  return null;
}
function vimeoId(url){
  const u = normalizeUrl(url);
  let m = u.match(/vimeo\.com\/(?:video\/)?(\d{6,})/);
  return m ? m[1] : null;
}
function driveFileId(url){
  const u = normalizeUrl(url);
  let m = u.match(/\/file\/d\/([a-zA-Z0-9_-]{10,})/);
  if (m) return m[1];
  m = u.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (m) return m[1];
  return null;
}
function isMp4(url){
  const u = normalizeUrl(url).toLowerCase();
  return u.endsWith('.mp4') || u.includes('.mp4?');
}

function renderMedia(videoUrl){
  const holder = qs('#lessonMedia');
  const empty = qs('#lessonMediaEmpty');
  if (!holder) return;

  const url = normalizeUrl(videoUrl);
  if (!url){
    holder.classList.add('d-none');
    if (empty) empty.classList.remove('d-none');
    return;
  }

  let html = '';
  const yid = youtubeId(url);
  const vid = vimeoId(url);
  const gid = driveFileId(url);

  if (yid){
    html = `<iframe src="https://www.youtube.com/embed/${yid}" title="YouTube video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
  } else if (vid){
    html = `<iframe src="https://player.vimeo.com/video/${vid}" title="Vimeo video" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>`;
  } else if (gid){
    html = `<iframe src="https://drive.google.com/file/d/${gid}/preview" title="Google Drive video" allow="autoplay" allowfullscreen></iframe>`;
  } else if (isMp4(url)){
    html = `<video src="${escapeHTML(url)}" controls style="width:100%;height:100%;object-fit:contain;background:#000"></video>`;
  } else {
    html = `<div class="d-flex flex-column gap-2">
      <div class="text-muted small">${escapeHTML(url)}</div>
      <a class="btn btn-outline-primary" target="_blank" rel="noopener" href="${escapeHTML(url)}">
        <i class="bx bx-link-external"></i> ${escapeHTML(t('lesson.open'))}
      </a>
    </div>`;
  }

  holder.innerHTML = html;
  holder.classList.remove('d-none');
  if (empty) empty.classList.add('d-none');
}

function parseResources(raw){
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  const s = String(raw).trim();
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return s.split('|').map(part => part.trim()).filter(Boolean).map(part => {
    const idx = part.indexOf('::');
    if (idx > -1){
      return { label: part.slice(0, idx).trim(), url: part.slice(idx+2).trim() };
    }
    return { label: part, url: part };
  });
}

function renderResources(lesson){
  const list = qs('#lessonResources');
  const empty = qs('#lessonResourcesEmpty');
  if (!list) return;

  const resourcesRaw = pickField(lesson, 'resources') || lesson.resources;
  let resources = parseResources(resourcesRaw);

  if (lesson.filesUrl){
    const u = normalizeUrl(lesson.filesUrl);
    if (u) resources.push({ label: 'Files', url: u });
  }

  const seen = new Set();
  resources = resources.filter(r => {
    const u = normalizeUrl(r.url);
    if (!u || seen.has(u)) return false;
    seen.add(u);
    return true;
  });

  if (!resources.length){
    list.classList.add('d-none');
    if (empty) empty.classList.remove('d-none');
    return;
  }

  list.innerHTML = resources.map(r => {
    const label = r.label || r.name || r.title || r.url;
    const url = normalizeUrl(r.url || '');
    const isDownload = /\.(zip|xlsx|xlsm|xls|pdf|docx|pptx|csv)(\?|$)/i.test(url);
    return `
      <a class="list-group-item list-group-item-action d-flex justify-content-between align-items-center" href="${escapeHTML(url)}" target="_blank" rel="noopener">
        <span class="text-truncate me-3">${escapeHTML(label)}</span>
        <span class="badge bg-label-secondary">
          ${escapeHTML(isDownload ? t('lesson.download') : t('lesson.open'))}
        </span>
      </a>
    `;
  }).join('');

  list.classList.remove('d-none');
  if (empty) empty.classList.add('d-none');
}

function render(){
  const titleEl = qs('#lessonTitle');
  const contentEl = qs('#lessonContent');
  const emptyEl = qs('#lessonEmpty');
  const quizCta = qs('#quizCta');

  if (!state.lessonId){
    renderEmpty(emptyEl, t('common.empty'), '');
    return;
  }
  if (!state.lesson){
    renderEmpty(emptyEl, t('common.empty'), '');
    return;
  }

  const lesson = state.lesson;

  if (titleEl) titleEl.textContent = pickField(lesson,'title') || lesson.title || state.lessonId;
  if (contentEl) setHTML(contentEl, pickField(lesson,'contentHtml') || lesson.contentHtml || '');
  if (emptyEl) emptyEl.innerHTML = '';

  // Done badge next to title (create once)
  if (titleEl && !qs('#lessonDoneBadge')){
    const span = document.createElement('span');
    span.id = 'lessonDoneBadge';
    span.className = 'badge bg-label-success ms-2 d-none';
    span.textContent = t('lesson.done');
    titleEl.parentElement?.appendChild(span);
  }

  updateDoneUI(isLessonCompleted(state.lessonId));

  renderMedia(lesson.videoUrl || pickField(lesson,'videoUrl') || '');
  renderResources(lesson);

  if (quizCta){
    if (state.hasQuiz){
      quizCta.classList.remove('disabled');
      quizCta.href = `quiz.html?lessonId=${encodeURIComponent(state.lessonId)}`;
    } else {
      quizCta.classList.add('disabled');
      quizCta.href = '#';
    }
  }
}

async function init(){
  initI18n();

  state.lessonId = new URL(window.location.href).searchParams.get('lessonId') || '';
  const emptyEl = qs('#lessonEmpty');

  if (!state.lessonId){
    renderEmpty(emptyEl, t('common.empty'), '');
    return;
  }

  try {
    state.lesson = await getLesson(state.lessonId);
  } catch (e){
    renderEmpty(emptyEl, t('errors.loadLesson'), String(e.message || e));
    return;
  }

  if (!state.lesson){
    renderEmpty(emptyEl, t('common.empty'), '');
    return;
  }

  markLessonVisited(state.lessonId);

  // Bind done button once
  const markDoneBtn = qs('#markDoneBtn');
  if (markDoneBtn && !markDoneBtn.__bound){
    markDoneBtn.__bound = true;
    markDoneBtn.addEventListener('click', () => {
      const now = !isLessonCompleted(state.lessonId);
      setLessonCompleted(state.lessonId, now);
      updateDoneUI(now);
    });
  }

  // Quiz existence (for CTA)
  try { state.hasQuiz = !!(await getQuizByLesson(state.lessonId)); } catch { state.hasQuiz = false; }

  render();

  function onLangChange(){
render(); // rerender immediately based on current content language (FR/EN) and UI language (FR/EN/AR)
}
window.__langChangedHook = onLangChange;
window.addEventListener('lang:changed', onLangChange);
}

init();
