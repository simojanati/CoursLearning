import './admin-mode.js';
import { getHealth } from './api.js';
import { qs, escapeHTML, renderEmpty } from './ui.js';
import { initI18n, t } from './i18n.js';
import { ensureTopbar } from './layout.js';

function badge(level){
  const map = { ok: 'success', warn: 'warning', err: 'danger', info: 'info' };
  const cls = map[level] || 'secondary';
  const label = level === 'ok' ? t('admin.health.status.ok')
              : level === 'warn' ? t('admin.health.status.warn')
              : level === 'err' ? t('admin.health.status.err')
              : level;
  return `<span class="badge bg-label-${cls}">${escapeHTML(label)}</span>`;
}

function renderSummary(health){
  const checks = health.checks || [];
  const errCount = checks.filter(c => String(c.level||'').toLowerCase()==='err').length;
  const warnCount = checks.filter(c => String(c.level||'').toLowerCase()==='warn').length;

  const el = qs('#healthSummary');
  if (!el) return;
  const ok = !!health.ok;
  const overall = ok ? badge('ok') : badge('err');
  const notes = (health.summaryNotes || []).map(n => `<div class="text-muted small">${escapeHTML(n)}</div>`).join('');
  el.innerHTML = `
    <div class="d-flex align-items-center justify-content-between">
      <div class="fw-semibold">Overall</div>
      <div>${overall}</div>
    </div>
    <div class="mt-3">
      <div class="d-flex gap-2 mb-2">
        <span class="badge bg-label-danger">${escapeHTML(String(errCount))} errors</span>
        <span class="badge bg-label-warning">${escapeHTML(String(warnCount))} warnings</span>
      </div>
      ${notes || ''}
    </div>
  `;
}

function renderSheets(health){
  const tbody = qs('#healthSheetsTbody');
  if (!tbody) return;

  const sheets = health.sheets || {};
  const rows = Object.entries(sheets).map(([name, s]) => {
    const exists = !!s.exists;
    const level = exists && (!s.missingHeaders || !s.missingHeaders.length) ? 'ok'
                : exists ? 'warn' : 'err';
    const missing = (s.missingHeaders || []).join(', ');
    return `
      <tr>
        <td class="fw-semibold">${escapeHTML(name)}</td>
        <td>${badge(level)}</td>
        <td class="text-muted">${escapeHTML(missing || '—')}</td>
      </tr>
    `;
  });

  tbody.innerHTML = rows.join('');
}


function groupKey(code, message){
  const c = String(code||'').toUpperCase();
  if (c.indexOf('RESOURCE')>-1) return 'Resources';
  if (c.indexOf('VIDEO')>-1) return 'Video';
  if (c.indexOf('HTML')>-1) return 'HTML';
  if (c.indexOf('LESSON')>-1) return 'Lessons';
  if (c.indexOf('QUIZ')>-1) return 'Quizzes';
  if (c.indexOf('QUESTION')>-1) return 'Questions';
  if (c.indexOf('COURSE')>-1) return 'Courses';
  if (c.indexOf('SHEET')>-1 || c.indexOf('HEADER')>-1) return 'Sheets';
  const m = String(message||'');
  if (/Lesson/i.test(m)) return 'Lessons';
  return 'General';
}

function renderChecks(health){
  const el = qs('#healthChecks');
  if (!el) return;

  const checks = health.checks || [];
  if (!checks.length){
    el.innerHTML = `<div class="text-muted">${escapeHTML(t('common.empty'))}</div>`;
    return;
  }

  // group
  const groups = {};
  checks.forEach(c => {
    const g = groupKey(c.code, c.message);
    (groups[g] = groups[g] || []).push(c);
  });

  const html = Object.keys(groups).sort().map(g => {
    const list = groups[g];
    return `
      <div class="mb-3">
        <div class="fw-bold mb-2">${escapeHTML(g)} <span class="text-muted small">(${list.length})</span></div>
        ${list.map(c => {
          const lvl = (c.level || 'info').toLowerCase();
          const msg = c.message || c.code || '';
          const details = c.details ? `<div class="text-muted small mt-1">${escapeHTML(String(c.details))}</div>` : '';
          return `
            <div class="d-flex align-items-start justify-content-between gap-3 mb-2">
              <div class="flex-grow-1">
                <div class="fw-semibold">${escapeHTML(msg)}</div>
                ${details}
              </div>
              <div>${badge(lvl)}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }).join('');

  el.innerHTML = html;
}


function renderCounts(health){
  const el = qs('#healthCounts');
  if (!el) return;

  const counts = health.counts || {};
  const items = Object.entries(counts).map(([k,v]) => {
    return `
      <div class="col-6 col-md-3">
        <div class="border rounded p-3 h-100">
          <div class="text-muted small">${escapeHTML(k)}</div>
          <div class="h4 mb-0">${escapeHTML(String(v))}</div>
        </div>
      </div>
    `;
  });
  el.innerHTML = items.join('');
}

async function run(){
  const empty = qs('#healthEmpty');
  if (empty) empty.innerHTML = '';
  try {
    const health = await getHealth();
    renderSummary(health);
    renderSheets(health);
    renderChecks(health);
    renderCounts(health);
    const raw = qs('#healthRaw');
    if (raw) raw.textContent = JSON.stringify(health, null, 2);
  } catch (e){
    renderEmpty(empty, 'Health check failed', String(e.message || e));
  }
}

async function init(){
  await ensureTopbar({ showSearch: true, searchPlaceholderKey: 'topbar.search' });
initI18n();
  qs('#runHealth')?.addEventListener('click', run);
  run();
}

init();

