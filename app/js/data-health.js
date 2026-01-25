import './admin-mode.js';
import { getHealth } from './api.js';
import { qs, escapeHTML, renderEmpty } from './ui.js';
import { initI18n, t } from './i18n.js';
import { ensureTopbar } from './layout.js';

function _lang(){ try { return (window.LH_LANG || document.documentElement.lang || 'fr'); } catch(e){ return 'fr'; } }

function localizeHealthText(msg){
  const lang = _lang();
  const m = String(msg||'');
  if (!m) return '';
  if (lang === 'fr'){
    return m
      .replace(/^Missing sheet:\s*(.+)$/i, 'Feuille manquante : $1')
      .replace(/^Missing required headers in ([^:]+):\s*(.+)$/i, 'En-têtes requis manquants dans $1 : $2')
      .replace(/^Optional headers missing in ([^:]+):\s*(.+)$/i, 'En-têtes optionnels manquants dans $1 : $2')
      .replace(/^Lesson\s+([^:]+):\s*duplicate resource URL\s*->\s*(.+)$/i, 'Leçon $1 : URL de ressource dupliquée → $2')
      .replace(/^Lesson\s+([^:]+):\s*resource URL not http\(s\)\s*->\s*(.+)$/i, 'Leçon $1 : URL de ressource invalide (http/https) → $2')
      .replace(/^Lesson\s+([^:]+):\s*resource missing label for\s+(.+)$/i, 'Leçon $1 : libellé manquant pour la ressource → $2')
      .replace(/^Lesson\s+([^:]+):\s*resource missing URL$/i, 'Leçon $1 : URL de ressource manquante')
      .replace(/^Duplicate ID in ([^:]+):\s*(.+)$/i, 'ID dupliqué dans $1 : $2')
      .replace(/^All core checks passed\.$/i, 'Tous les contrôles essentiels sont validés.')
      .replace(/^Some checks failed\.$/i, 'Certains contrôles ont échoué.')
      ;
  }
  if (lang === 'ar'){
    return m
      .replace(/^Missing sheet:\s*(.+)$/i, 'الورقة مفقودة: $1')
      .replace(/^Missing required headers in ([^:]+):\s*(.+)$/i, 'أعمدة إلزامية ناقصة في $1: $2')
      .replace(/^Optional headers missing in ([^:]+):\s*(.+)$/i, 'أعمدة اختيارية ناقصة في $1: $2')
      .replace(/^Lesson\s+([^:]+):\s*duplicate resource URL\s*->\s*(.+)$/i, 'الدرس $1: رابط مورد مكرر → $2')
      .replace(/^Lesson\s+([^:]+):\s*resource URL not http\(s\)\s*->\s*(.+)$/i, 'الدرس $1: رابط غير صالح (http/https) → $2')
      .replace(/^Lesson\s+([^:]+):\s*resource missing label for\s+(.+)$/i, 'الدرس $1: عنوان المورد ناقص → $2')
      .replace(/^Lesson\s+([^:]+):\s*resource missing URL$/i, 'الدرس $1: رابط المورد ناقص')
      .replace(/^Duplicate ID in ([^:]+):\s*(.+)$/i, 'معرّف مكرر في $1: $2')
      .replace(/^All core checks passed\.$/i, 'تم اجتياز جميع الفحوصات الأساسية.')
      .replace(/^Some checks failed\.$/i, 'فشلت بعض الفحوصات.')
      ;
  }
  return m;
}

function groupLabel(key){
  const lang = _lang();
  const map = {
    resources: { fr: 'Ressources', en: 'Resources', ar: 'الموارد' },
    video:     { fr: 'Vidéo',      en: 'Video',     ar: 'الفيديو' },
    html:      { fr: 'HTML',       en: 'HTML',      ar: 'HTML' },
    lessons:   { fr: 'Leçons',     en: 'Lessons',   ar: 'الدروس' },
    quizzes:   { fr: 'Quiz',       en: 'Quizzes',   ar: 'الاختبارات' },
    questions: { fr: 'Questions',  en: 'Questions', ar: 'الأسئلة' },
    courses:   { fr: 'Cours',      en: 'Courses',   ar: 'الدورات' },
    sheets:    { fr: 'Sheets',     en: 'Sheets',    ar: 'الأوراق' },
    general:   { fr: 'Général',    en: 'General',   ar: 'عام' }
  };
  return (map[key] && map[key][lang]) || (map[key] && map[key].en) || key;
}


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
  const notes = (health.summaryNotes || []).map(n => `<div class="text-muted small">${escapeHTML(localizeHealthText(n))}</div>`).join('');
  el.innerHTML = `
    <div class="d-flex align-items-center justify-content-between">
      <div class="fw-semibold">${escapeHTML(t('admin.health.summary.overall'))}</div>
      <div>${overall}</div>
    </div>
    <div class="mt-3">
      <div class="d-flex gap-2 mb-2">
        <span class="badge bg-label-danger">${escapeHTML(String(errCount))} ${escapeHTML(t('admin.health.summary.errors'))}</span>
        <span class="badge bg-label-warning">${escapeHTML(String(warnCount))} ${escapeHTML(t('admin.health.summary.warnings'))}</span>
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
  if (c.indexOf('RESOURCE')>-1) return 'resources';
  if (c.indexOf('VIDEO')>-1) return 'video';
  if (c.indexOf('HTML')>-1) return 'html';
  if (c.indexOf('LESSON')>-1) return 'lessons';
  if (c.indexOf('QUIZ')>-1) return 'quizzes';
  if (c.indexOf('QUESTION')>-1) return 'questions';
  if (c.indexOf('COURSE')>-1) return 'courses';
  if (c.indexOf('SHEET')>-1 || c.indexOf('HEADER')>-1) return 'sheets';
  const m = String(message||'');
  if (/Lesson/i.test(m)) return 'lessons';
  return 'general';
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
        <div class="fw-bold mb-2">${escapeHTML(groupLabel(g))} <span class="text-muted small">(${list.length})</span></div>
        ${list.map(c => {
          const lvl = (c.level || 'info').toLowerCase();
          const msg = localizeHealthText(c.message || c.code || '');
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
    renderEmpty(empty, t('admin.health.failed'), String(e.message || e));
  }
}

async function init(){
  await ensureTopbar({ showSearch: true, searchPlaceholderKey: 'topbar.search' });
initI18n();
  qs('#runHealth')?.addEventListener('click', run);
  run();
}

init();

