import './admin-mode.js';
import { initI18n, t, pickField } from './i18n.js';
import { qs, escapeHTML } from './ui.js';
import { sanitizeHtml, buildLessonHtml } from './authoring-tools.js';
import { getLesson, getQuizByLesson, getDomains, getModules, getCourses, upsertEntity, deleteEntity } from './api.js';
import { ensureTopbar } from './layout.js';
import { requireAuth } from './auth.js';

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

// ---------------- Content Manager (Domains/Modules/Courses) ----------------
const CM = {
  entity: 'Domains',
  domains: [],
  modules: [],
  courses: [],
  editing: null, // {entity, mode, data}
};

function cmMsg(kind, text){
  const el = qs('#cmMsg');
  if (!el) return;
  const cls = kind === 'ok' ? 'success' : kind === 'warn' ? 'warning' : 'danger';
  el.innerHTML = text ? `<div class="alert alert-${cls} py-2 mb-0">${escapeHTML(text)}</div>` : '';
}

function cmTitleFor(obj){
  return pickField(obj, 'name', 'title') || obj?.name_fr || obj?.title_fr || obj?.name_en || obj?.title_en || '';
}

function cmSortByOrderThenId(list, idKey){
  return [...(list||[])].sort((a,b)=>{
    const ao = Number(a?.order); const bo = Number(b?.order);
    const aHas = Number.isFinite(ao); const bHas = Number.isFinite(bo);
    if (aHas && bHas && ao !== bo) return ao - bo;
    if (aHas && !bHas) return -1;
    if (!aHas && bHas) return 1;
    return String(a?.[idKey]||'').localeCompare(String(b?.[idKey]||''));
  });
}

function renderDomains(){
  const tb = qs('#cmDomainsTbody');
  if (!tb) return;
  const rows = cmSortByOrderThenId(CM.domains, 'domainId').map(d => {
    const id = escapeHTML(String(d.domainId||''));
    const title = escapeHTML(cmTitleFor(d));
    const order = escapeHTML(String(d.order ?? ''));
    return `
      <tr>
        <td data-label="ID"><span class="fw-semibold">${id}</span></td>
        <td data-label="${escapeHTML(t('author.cm.col.title'))}">${title}</td>
        <td data-label="${escapeHTML(t('author.cm.col.order'))}">${order || '—'}</td>
        <td data-label="${escapeHTML(t('author.cm.col.actions'))}">
          <div class="d-flex flex-wrap gap-2">
            <button class="btn btn-sm btn-outline-primary" data-cm-edit="Domains" data-cm-id="${id}"><i class="bx bx-edit"></i> ${escapeHTML(t('author.cm.edit'))}</button>
            <button class="btn btn-sm btn-outline-danger" data-cm-del="Domains" data-cm-id="${id}"><i class="bx bx-trash"></i> ${escapeHTML(t('author.cm.delete'))}</button>
          </div>
        </td>
      </tr>
    `;
  });
  tb.innerHTML = rows.join('') || `<tr><td colspan="4" class="text-muted">${escapeHTML(t('common.empty'))}</td></tr>`;
}

function renderModules(){
  const tb = qs('#cmModulesTbody');
  if (!tb) return;
  const domainNameById = {};
  CM.domains.forEach(d => { domainNameById[String(d.domainId)] = cmTitleFor(d); });

  const rows = cmSortByOrderThenId(CM.modules, 'moduleId').map(m => {
    const id = escapeHTML(String(m.moduleId||''));
    const parent = escapeHTML(domainNameById[String(m.domainId)] || String(m.domainId||''));
    const title = escapeHTML(cmTitleFor(m));
    const order = escapeHTML(String(m.order ?? ''));
    return `
      <tr>
        <td data-label="ID"><span class="fw-semibold">${id}</span></td>
        <td data-label="${escapeHTML(t('author.cm.col.parent'))}">${parent}</td>
        <td data-label="${escapeHTML(t('author.cm.col.title'))}">${title}</td>
        <td data-label="${escapeHTML(t('author.cm.col.order'))}">${order || '—'}</td>
        <td data-label="${escapeHTML(t('author.cm.col.actions'))}">
          <div class="d-flex flex-wrap gap-2">
            <button class="btn btn-sm btn-outline-primary" data-cm-edit="Modules" data-cm-id="${id}"><i class="bx bx-edit"></i> ${escapeHTML(t('author.cm.edit'))}</button>
            <button class="btn btn-sm btn-outline-danger" data-cm-del="Modules" data-cm-id="${id}"><i class="bx bx-trash"></i> ${escapeHTML(t('author.cm.delete'))}</button>
          </div>
        </td>
      </tr>
    `;
  });
  tb.innerHTML = rows.join('') || `<tr><td colspan="5" class="text-muted">${escapeHTML(t('common.empty'))}</td></tr>`;
}

function renderCourses(){
  const tb = qs('#cmCoursesTbody');
  if (!tb) return;
  const moduleNameById = {};
  CM.modules.forEach(m => { moduleNameById[String(m.moduleId)] = cmTitleFor(m); });

  const rows = cmSortByOrderThenId(CM.courses, 'courseId').map(c => {
    const id = escapeHTML(String(c.courseId||''));
    const parent = escapeHTML(moduleNameById[String(c.moduleId)] || String(c.moduleId||''));
    const title = escapeHTML(cmTitleFor(c));
    const level = escapeHTML(String(c.level||'')) || '—';
    const order = escapeHTML(String(c.order ?? ''));
    return `
      <tr>
        <td data-label="ID"><span class="fw-semibold">${id}</span></td>
        <td data-label="${escapeHTML(t('author.cm.col.parent'))}">${parent}</td>
        <td data-label="${escapeHTML(t('author.cm.col.title'))}">${title}</td>
        <td data-label="${escapeHTML(t('author.cm.col.level'))}">${level}</td>
        <td data-label="${escapeHTML(t('author.cm.col.order'))}">${order || '—'}</td>
        <td data-label="${escapeHTML(t('author.cm.col.actions'))}">
          <div class="d-flex flex-wrap gap-2">
            <button class="btn btn-sm btn-outline-primary" data-cm-edit="Courses" data-cm-id="${id}"><i class="bx bx-edit"></i> ${escapeHTML(t('author.cm.edit'))}</button>
            <button class="btn btn-sm btn-outline-danger" data-cm-del="Courses" data-cm-id="${id}"><i class="bx bx-trash"></i> ${escapeHTML(t('author.cm.delete'))}</button>
          </div>
        </td>
      </tr>
    `;
  });
  tb.innerHTML = rows.join('') || `<tr><td colspan="6" class="text-muted">${escapeHTML(t('common.empty'))}</td></tr>`;
}

function renderContentManager(){
  renderDomains();
  renderModules();
  renderCourses();
  bindCmRowActions();
}

async function reloadContentManager(){
  cmMsg('', '');
  try {
    CM.domains = await getDomains();
    // fetch all modules and courses (unfiltered)
    CM.modules = await getModules();
    CM.courses = await getCourses({});
    renderContentManager();
  } catch (e){
    cmMsg('err', String(e.message || e));
  }
}

function cmFieldRow({ id, labelKey, type='text', value='', options=null, placeholder='' }){
  const label = escapeHTML(t(labelKey));
  const pid = 'cm_' + id;
  if (type === 'select'){
    const opts = (options||[]).map(o => `<option value="${escapeHTML(o.value)}"${String(o.value)===String(value)?' selected':''}>${escapeHTML(o.label)}</option>`).join('');
    return `
      <div class="col-12 col-md-6">
        <label class="form-label" for="${pid}">${label}</label>
        <select class="form-select" id="${pid}" data-cm-field="${escapeHTML(id)}">${opts}</select>
      </div>
    `;
  }
  const inputTag = type === 'textarea'
    ? `<textarea class="form-control" id="${pid}" data-cm-field="${escapeHTML(id)}" rows="3" placeholder="${escapeHTML(placeholder)}">${escapeHTML(String(value||''))}</textarea>`
    : `<input class="form-control" id="${pid}" data-cm-field="${escapeHTML(id)}" type="${escapeHTML(type)}" value="${escapeHTML(String(value||''))}" placeholder="${escapeHTML(placeholder)}" />`;
  return `
    <div class="col-12 col-md-6">
      <label class="form-label" for="${pid}">${label}</label>
      ${inputTag}
    </div>
  `;
}

function openCmModal({ entity, mode, data }){
  CM.editing = { entity, mode, data: data || {} };
  const form = qs('#cmForm');
  const titleEl = qs('#cmModalTitle');
  const modalEl = qs('#cmModal');
  if (!form || !modalEl) return;

  const isEdit = mode === 'edit';
  if (titleEl) titleEl.textContent = isEdit ? t('author.cm.modal.edit') : t('author.cm.modal.add');

  const d = data || {};
  const fields = [];

  if (entity === 'Domains'){
    fields.push(cmFieldRow({ id:'domainId', labelKey:'author.cm.field.domainId', value: d.domainId || '', placeholder:'d-001' }));
    fields.push(cmFieldRow({ id:'order', labelKey:'author.cm.field.order', type:'number', value: d.order ?? '' }));
    fields.push(cmFieldRow({ id:'icon', labelKey:'author.cm.field.icon', value: d.icon || '', placeholder:'bx bx-briefcase' }));
    fields.push(cmFieldRow({ id:'name_fr', labelKey:'author.cm.field.nameFr', value: d.name_fr || '' }));
    fields.push(cmFieldRow({ id:'name_en', labelKey:'author.cm.field.nameEn', value: d.name_en || '' }));
    fields.push(cmFieldRow({ id:'name_ar', labelKey:'author.cm.field.nameAr', value: d.name_ar || '' }));
    fields.push(cmFieldRow({ id:'description_fr', labelKey:'author.cm.field.descFr', type:'textarea', value: d.description_fr || '' }));
    fields.push(cmFieldRow({ id:'description_en', labelKey:'author.cm.field.descEn', type:'textarea', value: d.description_en || '' }));
    fields.push(cmFieldRow({ id:'description_ar', labelKey:'author.cm.field.descAr', type:'textarea', value: d.description_ar || '' }));
  }

  if (entity === 'Modules'){
    const domainOpts = CM.domains.map(x => ({ value: String(x.domainId||''), label: cmTitleFor(x) || String(x.domainId||'') }));
    fields.push(cmFieldRow({ id:'moduleId', labelKey:'author.cm.field.moduleId', value: d.moduleId || '', placeholder:'m-001' }));
    fields.push(cmFieldRow({ id:'domainId', labelKey:'author.cm.field.domainId', type:'select', value: d.domainId || '', options: [{value:'',label:'—'}].concat(domainOpts) }));
    fields.push(cmFieldRow({ id:'order', labelKey:'author.cm.field.order', type:'number', value: d.order ?? '' }));
    fields.push(cmFieldRow({ id:'icon', labelKey:'author.cm.field.icon', value: d.icon || '', placeholder:'bx bx-chip' }));
    fields.push(cmFieldRow({ id:'title_fr', labelKey:'author.cm.field.titleFr', value: d.title_fr || '' }));
    fields.push(cmFieldRow({ id:'title_en', labelKey:'author.cm.field.titleEn', value: d.title_en || '' }));
    fields.push(cmFieldRow({ id:'title_ar', labelKey:'author.cm.field.titleAr', value: d.title_ar || '' }));
    fields.push(cmFieldRow({ id:'description_fr', labelKey:'author.cm.field.descFr', type:'textarea', value: d.description_fr || '' }));
    fields.push(cmFieldRow({ id:'description_en', labelKey:'author.cm.field.descEn', type:'textarea', value: d.description_en || '' }));
    fields.push(cmFieldRow({ id:'description_ar', labelKey:'author.cm.field.descAr', type:'textarea', value: d.description_ar || '' }));
  }

  if (entity === 'Courses'){
    const moduleOpts = CM.modules.map(x => ({ value: String(x.moduleId||''), label: cmTitleFor(x) || String(x.moduleId||'') }));
    fields.push(cmFieldRow({ id:'courseId', labelKey:'author.cm.field.courseId', value: d.courseId || '', placeholder:'c-001' }));
    fields.push(cmFieldRow({ id:'moduleId', labelKey:'author.cm.field.moduleId', type:'select', value: d.moduleId || '', options: [{value:'',label:'—'}].concat(moduleOpts) }));
    fields.push(cmFieldRow({ id:'level', labelKey:'author.cm.field.level', value: d.level || '', placeholder:'beginner/intermediate/advanced' }));
    fields.push(cmFieldRow({ id:'order', labelKey:'author.cm.field.order', type:'number', value: d.order ?? '' }));
    fields.push(cmFieldRow({ id:'title_fr', labelKey:'author.cm.field.titleFr', value: d.title_fr || '' }));
    fields.push(cmFieldRow({ id:'title_en', labelKey:'author.cm.field.titleEn', value: d.title_en || '' }));
    fields.push(cmFieldRow({ id:'title_ar', labelKey:'author.cm.field.titleAr', value: d.title_ar || '' }));
    fields.push(cmFieldRow({ id:'description_fr', labelKey:'author.cm.field.descFr', type:'textarea', value: d.description_fr || '' }));
    fields.push(cmFieldRow({ id:'description_en', labelKey:'author.cm.field.descEn', type:'textarea', value: d.description_en || '' }));
    fields.push(cmFieldRow({ id:'description_ar', labelKey:'author.cm.field.descAr', type:'textarea', value: d.description_ar || '' }));
  }

  form.innerHTML = fields.join('');

  // lock id on edit
  if (isEdit){
    const idKey = entity === 'Domains' ? 'domainId' : entity === 'Modules' ? 'moduleId' : 'courseId';
    const idInput = form.querySelector(`[data-cm-field="${idKey}"]`);
    if (idInput) idInput.setAttribute('disabled','disabled');
  }

  const modal = window.window.bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();
}

function collectCmForm(){
  const form = qs('#cmForm');
  if (!form) return {};
  const obj = {};
  form.querySelectorAll('[data-cm-field]').forEach(el => {
    const k = el.getAttribute('data-cm-field');
    if (!k) return;
    let v = el.value;
    if (el.type === 'number'){
      v = v === '' ? '' : Number(v);
      if (!Number.isFinite(v)) v = '';
    }
    obj[k] = v;
  });
  // restore id in edit (disabled)
  if (CM.editing?.mode === 'edit'){
    const idKey = CM.editing.entity === 'Domains' ? 'domainId' : CM.editing.entity === 'Modules' ? 'moduleId' : 'courseId';
    obj[idKey] = CM.editing.data[idKey];
  }
  return obj;
}

async function saveCm(){
  if (!CM.editing) return;
  cmMsg('', '');
  const { entity } = CM.editing;
  const obj = collectCmForm();

  try {
    await upsertEntity(entity, obj);
    cmMsg('ok', t('author.cm.saved'));
    // close modal
    const modalEl = qs('#cmModal');
    if (modalEl) window.window.window.bootstrap.Modal.getOrCreateInstance(modalEl).hide();
    await reloadContentManager();
  } catch (e){
    cmMsg('err', String(e.message || e));
  }
}

async function deleteCm(entity, id){
  if (!confirm(t('author.cm.confirmDelete'))) return;
  cmMsg('', '');
  try {
    await deleteEntity(entity, id);
    cmMsg('ok', t('author.cm.deleted'));
    await reloadContentManager();
  } catch (e){
    cmMsg('err', String(e.message || e));
  }
}

function bindCmRowActions(){
  // edit
  document.querySelectorAll('[data-cm-edit]').forEach(btn => {
    btn.addEventListener('click', ()=>{
      const entity = btn.getAttribute('data-cm-edit');
      const id = btn.getAttribute('data-cm-id');
      if (!entity || !id) return;
      const list = entity === 'Domains' ? CM.domains : entity === 'Modules' ? CM.modules : CM.courses;
      const key = entity === 'Domains' ? 'domainId' : entity === 'Modules' ? 'moduleId' : 'courseId';
      const item = list.find(x => String(x[key]) === String(id)) || null;
      openCmModal({ entity, mode:'edit', data: item || {} });
    }, { once: true });
  });
  // delete
  document.querySelectorAll('[data-cm-del]').forEach(btn => {
    btn.addEventListener('click', ()=>{
      const entity = btn.getAttribute('data-cm-del');
      const id = btn.getAttribute('data-cm-id');
      if (!entity || !id) return;
      deleteCm(entity, id);
    }, { once: true });
  });
}

function initContentManager(){
  const addBtn = qs('#cmAddBtn');
  addBtn?.addEventListener('click', ()=>{
    // determine active tab
    const active = document.querySelector('#cmTabs .nav-link.active');
    let entity = 'Domains';
    if (active?.id === 'cmTabModules') entity = 'Modules';
    if (active?.id === 'cmTabCourses') entity = 'Courses';
    openCmModal({ entity, mode:'add', data:{} });
  });

  qs('#cmSaveBtn')?.addEventListener('click', saveCm);

  // refresh when switching tabs (keeps actions rebound)
  document.querySelectorAll('#cmTabs .nav-link').forEach(tab => {
    tab.addEventListener('shown.bs.tab', ()=> renderContentManager());
  });

  reloadContentManager();
}

async function init(){
  requireAuth({ roles: ['admin'] });

  await ensureTopbar({ showSearch: true, searchPlaceholderKey: 'topbar.search' });
initI18n();
  initContentManager();

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