import './admin-mode.js';
import { initI18n, t, pickField } from './i18n.js';
import { qs, escapeHTML } from './ui.js';
import { sanitizeHtml, buildLessonHtml } from './authoring-tools.js';
import { getLesson, getQuizByLesson } from './api.js';
import { ensureTopbar } from './layout.js';

function copyFrom(selector){
  const el = document.querySelector(selector);
  if (!el) return;
  const val = el.value || el.textContent || '';
  navigator.clipboard?.writeText(val);
}

function setPreview(html){
  const frame = qs('#previewFrame');
  if (!frame) return;
  const doc = frame.contentDocument || frame.contentWindow.document;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:Arial, sans-serif;padding:12px}
    pre.code-block{background:#0b1020;color:#e7e9ff;padding:12px;border-radius:8px;overflow:auto}
    .lesson-content ul, .lesson-content ol{padding-left:18px}
  </style></head><body>${html}</body></html>`);
  doc.close();
}

function splitLines(text){
  return String(text||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
}

function createResRow(label='', url=''){
  const wrap = document.createElement('div');
  wrap.className = 'row g-2';
  wrap.innerHTML = `
    <div class="col-5"><input class="form-control res-label" placeholder="${t('author.label')}" value="${label}"></div>
    <div class="col-6"><input class="form-control res-url" placeholder="${t('author.url')}" value="${url}"></div>
    <div class="col-1 d-grid"><button class="btn btn-outline-danger btn-sm res-del" title="X">×</button></div>
  `;
  wrap.querySelector('.res-del').addEventListener('click', ()=> wrap.remove());
  return wrap;
}

function getResRows(){
  return Array.from(document.querySelectorAll('#resRows .row')).map(r => {
    const label = r.querySelector('.res-label')?.value?.trim() || '';
    const url = r.querySelector('.res-url')?.value?.trim() || '';
    return { label, url };
  }).filter(x => x.label || x.url);
}

function exportPipe(rows){
  return rows.map(r => {
    const l = (r.label || r.url || '').replace(/\|/g,'/');
    const u = (r.url || '').replace(/\|/g,'%7C');
    return `${l}::${u}`;
  }).join('|');
}

function exportJson(rows){
  return JSON.stringify(rows.map(r => ({ label:r.label || r.url, url:r.url })));
}

function bindCopyButtons(){
  document.querySelectorAll('[data-copy]').forEach(btn => {
    btn.addEventListener('click', ()=> copyFrom(btn.getAttribute('data-copy')));
  });
}

// ---------- Validate lesson row ----------
function youtubeId(url){
  const u = String(url||'').trim();
  let m = u.match(/youtu\.be\/([a-zA-Z0-9_-]{6,})/);
  if (m) return m[1];
  m = u.match(/[?&]v=([a-zA-Z0-9_-]{6,})/);
  if (m) return m[1];
  m = u.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{6,})/);
  if (m) return m[1];
  return null;
}
function vimeoId(url){
  const u = String(url||'').trim();
  const m = u.match(/vimeo\.com\/(?:video\/)?(\d{6,})/);
  return m ? m[1] : null;
}
function driveFileId(url){
  const u = String(url||'').trim();
  let m = u.match(/\/file\/d\/([a-zA-Z0-9_-]{10,})/);
  if (m) return m[1];
  m = u.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  return m ? m[1] : null;
}
function isMp4(url){
  const u = String(url||'').trim().toLowerCase();
  return u.endsWith('.mp4') || u.includes('.mp4?');
}
function isHttp(url){
  return /^https?:\/\//i.test(String(url||'').trim());
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
  return s.split('|').map(p=>p.trim()).filter(Boolean).map(p=>{
    const idx = p.indexOf('::');
    if (idx>-1) return { label: p.slice(0,idx).trim(), url: p.slice(idx+2).trim() };
    return { label: p, url: p };
  });
}

function hasDangerousHtml(html){
  const s = String(html||'');
  if (/<\s*script\b/i.test(s)) return true;
  if (/on[a-z]+\s*=\s*["']/i.test(s)) return true;
  if (/javascript:\s*/i.test(s)) return true;
  return false;
}

function statusBadge(kind){
  const map = { ok:'success', warn:'warning', err:'danger' };
  const txtKey = kind==='ok'?'author.status.ok':(kind==='warn'?'author.status.warn':'author.status.err');
  return `<span class="badge bg-label-${map[kind]}">${escapeHTML(t(txtKey))}</span>`;
}

function reportItem(kind, titleKey, message){
  return `
    <div class="border rounded p-2 d-flex align-items-start justify-content-between gap-3">
      <div>
        <div class="fw-semibold">${escapeHTML(t(titleKey))}</div>
        <div class="text-muted small">${escapeHTML(message || '')}</div>
      </div>
      ${statusBadge(kind)}
    </div>
  `;
}

async function validateLessonRow(lessonId){
  const out = qs('#validateReport');
  if (!out) return;

  out.innerHTML = '';

  if (!lessonId){
    out.innerHTML = reportItem('err','author.validateLesson','Missing lessonId');
    return;
  }

  let lesson = null;
  try { lesson = await getLesson(lessonId); }
  catch (e){
    out.innerHTML = reportItem('err','author.validateLesson', String(e.message || e));
    return;
  }

  if (!lesson){
    out.innerHTML = reportItem('err','author.validateLesson','Lesson not found');
    return;
  }

  const items = [];

  // Titles
  const tf = lesson.title_fr || '';
  const te = lesson.title_en || '';
  if (!tf || !te) items.push(reportItem('warn','author.check.title','Missing FR or EN title'));
  else items.push(reportItem('ok','author.check.title','OK'));

  // HTML
  const htmlFr = lesson.contentHtml_fr || '';
  const htmlEn = lesson.contentHtml_en || '';
  if (!htmlFr || !htmlEn){
    items.push(reportItem('warn','author.check.html','Missing FR or EN contentHtml'));
  } else if (hasDangerousHtml(htmlFr) || hasDangerousHtml(htmlEn)){
    items.push(reportItem('err','author.check.html','Contains <script>, on* attributes or javascript:'));
  } else {
    // compare sanitizer output to detect changes
    const sFr = sanitizeHtml(htmlFr);
    const sEn = sanitizeHtml(htmlEn);
    if (sFr !== htmlFr || sEn !== htmlEn) items.push(reportItem('warn','author.check.html','Sanitizer would change the HTML (check links/attributes)'));
    else items.push(reportItem('ok','author.check.html','OK'));
  }

  // Video URL
  const v = lesson.videoUrl || '';
  if (!v){
    items.push(reportItem('ok','author.check.video','Empty (optional)'));
  } else if (!isHttp(v)){
    items.push(reportItem('warn','author.check.video','Video URL is not http(s)'));
  } else if (youtubeId(v) || vimeoId(v) || driveFileId(v) || isMp4(v)){
    items.push(reportItem('ok','author.check.video','Embeddable'));
  } else {
    items.push(reportItem('warn','author.check.video','Not recognized for embed (will fallback to open link)'));
  }

  // Resources
  const rFr = lesson.resources_fr || '';
  const rEn = lesson.resources_en || '';
  const resAll = [...parseResources(rFr), ...parseResources(rEn)];
  if (!rFr && !rEn && !lesson.filesUrl){
    items.push(reportItem('ok','author.check.resources','Empty (optional)'));
  } else {
    let bad = 0;
    let warn = 0;
    const seen = new Set();
    resAll.forEach(r=>{
      const url = String(r.url||'').trim();
      const label = String(r.label||'').trim();
      if (!url) { bad++; return; }
      if (!isHttp(url)) warn++;
      if (!label) warn++;
      if (seen.has(url)) warn++;
      seen.add(url);
    });
    if (bad>0) items.push(reportItem('err','author.check.resources','Some resources have empty URL'));
    else if (warn>0) items.push(reportItem('warn','author.check.resources','Check labels/duplicates or non-http URLs'));
    else items.push(reportItem('ok','author.check.resources','OK'));
  }

  // Quiz existence
  try {
    const quiz = await getQuizByLesson(lessonId);
    if (quiz) items.push(reportItem('ok','author.check.quiz','Quiz found'));
    else items.push(reportItem('warn','author.check.quiz','No quiz for this lesson (optional)'));
  } catch {
    items.push(reportItem('warn','author.check.quiz','Could not fetch quiz'));
  }

  out.innerHTML = items.join('');
}

async function init(){
  await ensureTopbar({ showSearch: true, searchPlaceholderKey: 'topbar.search' });
initI18n();

  const htmlInput = qs('#htmlInput');
  const btnPreview = qs('#btnPreview');
  const btnSanitize = qs('#btnSanitize');
  const btnCopySanitized = qs('#btnCopySanitized');

  btnPreview?.addEventListener('click', ()=> setPreview(htmlInput.value || '') );
  btnSanitize?.addEventListener('click', ()=>{
    const sanitized = sanitizeHtml(htmlInput.value || '');
    htmlInput.value = sanitized;
    setPreview(sanitized);
  });
  btnCopySanitized?.addEventListener('click', ()=> navigator.clipboard?.writeText(htmlInput.value || '') );

  const btnGenerate = qs('#btnGenerate');
  const outFr = qs('#outFr');
  const outEn = qs('#outEn');

  btnGenerate?.addEventListener('click', ()=>{
    const titleFr = qs('#tTitleFr')?.value || '';
    const titleEn = qs('#tTitleEn')?.value || '';
    const objectives = splitLines(qs('#tObjectives')?.value || '');
    const steps = splitLines(qs('#tSteps')?.value || '');
    const code = qs('#tCode')?.value || '';

    outFr.value = sanitizeHtml(buildLessonHtml({ title: titleFr, objectives, steps, code }));
    outEn.value = sanitizeHtml(buildLessonHtml({ title: titleEn || titleFr, objectives, steps, code }));
  });

  // Resources builder
  const resRows = qs('#resRows');
  const btnAddRow = qs('#btnAddRow');
  const resOutput = qs('#resOutput');
  const btnExportPipe = qs('#btnExportPipe');
  const btnExportJson = qs('#btnExportJson');

  function addRow(l='',u=''){ resRows.appendChild(createResRow(l,u)); }
  btnAddRow?.addEventListener('click', ()=> addRow());
  addRow(); addRow();

  btnExportPipe?.addEventListener('click', ()=> { resOutput.value = exportPipe(getResRows()); });
  btnExportJson?.addEventListener('click', ()=> { resOutput.value = exportJson(getResRows()); });

  bindCopyButtons();

  // Validate lesson
  const btnValidateLesson = qs('#btnValidateLesson');
  const validateLessonId = qs('#validateLessonId');
  btnValidateLesson?.addEventListener('click', (e)=>{
    e.preventDefault();
    validateLessonRow((validateLessonId?.value || '').trim());
  });
}

init();
