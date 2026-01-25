import { getLesson, getQuizByLesson, getCourse, getLessons, getDomains, getModules, aiChat } from './api.js';
import { qs, renderEmpty, setHTML, escapeHTML, renderBreadcrumbs } from './ui.js';
import { markLessonVisited, setLessonCompleted, isLessonCompleted, loadAiChat, saveAiChat, clearAiChat, loadAiScope, saveAiScope, saveCourseProgress, upsertCourseMeta } from './storage.js';
import { initI18n, t, pickField } from './i18n.js';
import { AI_ENABLED, AI_MAX_INPUT_CHARS, AI_DEFAULT_MODE } from './app-config.js';
import { ensureTopbar } from './layout.js';

const state = {
  lessonId: '',
  courseId: '',
  domainId: '',
  moduleId: '',
  lesson: null,
  course: null,
  courseLessons: [],
  domains: [],
  modules: [],
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
      const qsPart = [`lessonId=${encodeURIComponent(state.lessonId)}`];
      if (state.courseId) qsPart.push(`courseId=${encodeURIComponent(state.courseId)}`);
      if (state.domainId) qsPart.push(`domainId=${encodeURIComponent(state.domainId)}`);
      if (state.moduleId) qsPart.push(`moduleId=${encodeURIComponent(state.moduleId)}`);
      quizCta.href = `quiz.html?${qsPart.join('&')}`;
    } else {
      quizCta.classList.add('disabled');
      quizCta.href = '#';
    }
  }
}


async function loadNavData(force=false){
  // Fetch navigation datasets once (language switch does not require re-fetch)
  if (force || !state.domains || !state.domains.length){
    try { state.domains = await getDomains(); } catch { state.domains = []; }
  }
  if (state.domainId){
    if (force || !state.modules || !state.modules.length){
      try { state.modules = await getModules(state.domainId); } catch { state.modules = []; }
    }
  } else {
    state.modules = [];
  }

  if (state.courseId){
    if (force || !state.course){
      try { state.course = await getCourse(state.courseId); } catch { state.course = null; }
    }
    if (force || !state.courseLessons || !state.courseLessons.length){
      try { state.courseLessons = await getLessons(state.courseId); } catch { state.courseLessons = []; }
    }
  } else {
    state.course = null;
    state.courseLessons = [];
  }
}

function setupNavAndBreadcrumbs(){
  // Navigation buttons (Back / Prev / Next)
  const navRow = qs('#lessonNavRow');
  const backBtn = qs('#backToCourseBtn');
  const prevBtn = qs('#prevLessonBtn');
  const nextBtn = qs('#nextLessonBtn');

  if (navRow){
    navRow.style.display = state.courseId ? '' : 'none';
  }

  // Back link
  if (backBtn){
    if (state.courseId){
      const qsPart = [`courseId=${encodeURIComponent(state.courseId)}`];
      if (state.domainId) qsPart.push(`domainId=${encodeURIComponent(state.domainId)}`);
      if (state.moduleId) qsPart.push(`moduleId=${encodeURIComponent(state.moduleId)}`);
      backBtn.href = `course.html?${qsPart.join('&')}`;
    } else {
      backBtn.href = 'courses.html';
    }
  }

  // Prev/Next links
  const list = state.courseLessons || [];
  const idx = list.findIndex(l => String(l.lessonId) === String(state.lessonId));
  const prev = idx > 0 ? list[idx-1] : null;
  const next = (idx >= 0 && idx < list.length-1) ? list[idx+1] : null;

  const mkLessonHref = (lessonId) => {
    const qsPart = [`lessonId=${encodeURIComponent(lessonId)}`];
    if (state.courseId) qsPart.push(`courseId=${encodeURIComponent(state.courseId)}`);
    if (state.domainId) qsPart.push(`domainId=${encodeURIComponent(state.domainId)}`);
    if (state.moduleId) qsPart.push(`moduleId=${encodeURIComponent(state.moduleId)}`);
    return `lesson.html?${qsPart.join('&')}`;
  };

  if (prevBtn){
    prevBtn.classList.toggle('d-none', !prev);
    if (prev) prevBtn.href = mkLessonHref(prev.lessonId);
  }
  if (nextBtn){
    nextBtn.classList.toggle('d-none', !next);
    if (next) nextBtn.href = mkLessonHref(next.lessonId);
  }

  // Breadcrumbs
  const domain = state.domainId ? state.domains.find(d => String(d.domainId) === String(state.domainId)) : null;
  const module = state.moduleId ? state.modules.find(m => String(m.moduleId) === String(state.moduleId)) : null;

  const domainName = domain ? (pickField(domain,'name') || domain.domainId) : (state.domainId || '');
  const moduleName = module ? (pickField(module,'title') || module.moduleId) : (state.moduleId || '');
  const courseName = state.course ? (pickField(state.course,'title') || state.course.courseId || '') : '';

  const lessonName = state.lesson ? (pickField(state.lesson,'title') || state.lesson.title || '') : '';

  const bc = [{ label: t('menu.home'), href: 'home.html' }];
  if (domainName) bc.push({ label: domainName, href: `modules.html?domainId=${encodeURIComponent(state.domainId)}` });
  if (moduleName) bc.push({ label: moduleName, href: `courses.html?domainId=${encodeURIComponent(state.domainId)}&moduleId=${encodeURIComponent(state.moduleId)}` });
  if (state.courseId) bc.push({ label: courseName || t('page.course'), href: `course.html?courseId=${encodeURIComponent(state.courseId)}&domainId=${encodeURIComponent(state.domainId||'')}&moduleId=${encodeURIComponent(state.moduleId||'')}` });
  bc.push({ label: lessonName || t('page.lesson'), active: true });

  renderBreadcrumbs(bc);
}


// ---------------- AI Assistant ----------------
function renderAiMessages(messages){
  const box = qs('#aiMessages');
  if (!box) return;
  if (!messages || !messages.length){
    box.innerHTML = `<div class="text-muted small">—</div>`;
    return;
  }
  box.innerHTML = messages.map(m => {
    const role = m.role === 'user' ? 'user' : 'assistant';
    const text = escapeHTML(String(m.text || ''));
    const meta = m.mode ? `<div class="ai-meta">${escapeHTML(String(m.mode))}</div>` : '';
    return `<div class="ai-msg ${role}">
      <div class="ai-bubble">${text}${meta}</div>
    </div>`;
  }).join('');
  // scroll to bottom
  box.scrollTop = box.scrollHeight;
}

function setAiStatus(txt, isError=false){
  const el = qs('#aiStatus');
  if (!el) return;
  el.textContent = txt || '';
  el.classList.toggle('text-danger', !!isError);
  el.classList.toggle('text-muted', !isError);
}

function showAiTyping(){
  const box = qs('#aiMessages');
  if (!box) return;
  if (qs('#aiTyping')) return;
  const el = document.createElement('div');
  el.id = 'aiTyping';
  el.className = 'ai-typing';
  el.innerHTML = `<div class="ai-bubble"><span class="dots"><span></span><span></span><span></span></span></div>`;
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
}

function hideAiTyping(){
  const el = qs('#aiTyping');
  if (el) el.remove();
}

function getUiLang(){
  try { return (localStorage.getItem('learnHub:lang') || localStorage.getItem('vbaEco:lang') || localStorage.getItem('lang') || 'fr'); } catch { return 'fr'; }
}

function stripHtmlToText(html){
  const div = document.createElement('div');
  div.innerHTML = String(html || '');
  return (div.textContent || div.innerText || '').trim();
}

function buildLessonAiContext(){
  if (!state.lesson) return { title:'', context:'' };
  const title = pickField(state.lesson,'title') || state.lesson.title || state.lessonId;
  const html = pickField(state.lesson,'contentHtml') || state.lesson.contentHtml || '';
  let ctx = stripHtmlToText(html);
  // normalize whitespace
  ctx = ctx.replace(/\r\n/g,'\n').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
  const MAX = 3500; // keep query string reasonable
  if (ctx.length > MAX) ctx = ctx.slice(0, MAX) + '…';
  return { title, context: ctx };
}

function quickPrompt(kind, lang){
  const l = String(lang || 'fr');
  const map = {
    summary: {
      fr: "Fais un résumé clair de cette leçon (points clés + mini exemple si utile).",
      en: "Summarize this lesson clearly (key points + a small example if useful).",
      ar: "لخّص هذا الدرس بشكل واضح (نقاط أساسية + مثال صغير إن كان مفيداً)."
    },
    simple: {
      fr: "Explique cette leçon très simplement, comme si j'étais débutant.",
      en: "Explain this lesson very simply, as if I'm a beginner.",
      ar: "اشرح هذا الدرس بطريقة مبسطة جداً كأني مبتدئ."
    },
    questions: {
      fr: "Donne-moi 5 questions d'entraînement (avec réponses courtes) sur cette leçon.",
      en: "Give me 5 practice questions (with short answers) about this lesson.",
      ar: "اعطني 5 أسئلة تدريبية (مع أجوبة قصيرة) حول هذا الدرس."
    }
  };
  return (map[kind] && (map[kind][l] || map[kind].fr)) || '';
}

function selectionPrompt(lang, selectionText){
  const l = String(lang || 'fr');
  const s0 = String(selectionText || '').trim();
  if (!s0) return '';
  const s = s0.replace(/\s+/g, ' ').trim();
  const map = {
    fr: (t) => `Explique cet extrait et donne un exemple si possible :\n\n“${t}”`,
    en: (t) => `Explain this excerpt and provide an example if possible:\n\n“${t}”`,
    ar: (t) => `اشرح هذا المقتطف وقدّم مثالاً إن أمكن:\n\n“${t}”`
  };
  const fn = map[l] || map.fr;
  return fn(s);
}

function initAiPanel(){
  const off = qs('#aiOffcanvas');
  const btn = qs('#aiBtn');
  if (!off || !btn) return;

  if (!AI_ENABLED){
    off.remove();
    btn.classList.add('d-none');
    return;
  }

  const firstBind = !off.__lhBound;
  if (firstBind) off.__lhBound = true;

  // Side placement based on direction
  const isRtl = document.documentElement.getAttribute('dir') === 'rtl';
  off.classList.toggle('offcanvas-start', isRtl);
  off.classList.toggle('offcanvas-end', !isRtl);

  const titleTxt = pickField(state.lesson,'title') || state.lesson?.title || '';
  const tag = qs('#aiLessonTag');
  if (tag) tag.textContent = titleTxt ? ('— ' + titleTxt) : '';

  const input = qs('#aiInput');
  const hint = qs('#aiHint');
  const modeSel = qs('#aiMode');
  const scopeToggle = qs('#aiScopeToggle');

  // Placeholder/hint via i18n
  if (input) input.placeholder = t('ai.placeholder');

  if (modeSel && AI_DEFAULT_MODE) modeSel.value = AI_DEFAULT_MODE;

  // Scope (lesson-only by default). Toggle = allow general questions.
  const savedScope = loadAiScope(state.lessonId);
  if (scopeToggle){
    scopeToggle.checked = !!savedScope;
    scopeToggle.title = t('ai.scope.hint');
  }

  function currentScope(){
    return scopeToggle && scopeToggle.checked ? 'general' : 'lesson';
  }

  function updateHint(){
    if (!hint) return;
    const base = `${t('ai.placeholder')}`.replace('(Ctrl+Entrée pour envoyer)','').replace('(Ctrl+Enter to send)','').replace('(Ctrl+Enter للإرسال)','').trim();
    const extra = (scopeToggle && scopeToggle.checked) ? t('ai.scope.hint') : '';
    hint.textContent = extra ? (base + ' • ' + extra) : base;
  }
  updateHint();

  if (scopeToggle){
    if (firstBind) scopeToggle.addEventListener('change', () => {
      saveAiScope(state.lessonId, scopeToggle.checked);
      updateHint();
    });
  }

  // Load history
  const history = loadAiChat(state.lessonId);
  renderAiMessages(history);

  // Focus input when drawer opens
  try {
    if (firstBind) off.addEventListener('shown.bs.offcanvas', () => {
      renderAiMessages(loadAiChat(state.lessonId));
      input?.focus();
    });
  } catch {}

  // Clear
  const clearBtn = qs('#aiClearBtn');
  if (clearBtn){
    if (firstBind) clearBtn.addEventListener('click', () => {
      clearAiChat(state.lessonId);
      renderAiMessages([]);
      hideAiTyping();
      try { if (input) input.disabled = false; } catch {}
      try { const sb = qs('#aiSendBtn'); if (sb) sb.disabled = false; } catch {}
      setAiStatus('');
    });
  }

  async function send(overrideText=''){
    const q0 = overrideText ? String(overrideText) : String(input?.value || '');
    const q = q0.trim();
    if (!q) return;

    if (q.length > AI_MAX_INPUT_CHARS){
      setAiStatus(`Max ${AI_MAX_INPUT_CHARS} chars.`, true);
      return;
    }

    const mode = String(modeSel?.value || 'explain');
    const lang = getUiLang();
    const scope = currentScope();
    const ctx = buildLessonAiContext();

    // optimistic render user message
    const msgs = loadAiChat(state.lessonId);
    msgs.push({ role:'user', text:q, mode: mode, ts: Date.now() });
    saveAiChat(state.lessonId, msgs);
    renderAiMessages(msgs);

    if (!overrideText && input) input.value = '';
    setAiStatus(t('ai.thinking'), false);
    hideAiTyping();
    showAiTyping();
    try { if (input) input.disabled = true; } catch {}
    try { if (sendBtn) sendBtn.disabled = true; } catch {}

    try {
      const res = await aiChat({
        lessonId: state.lessonId,
        lang,
        mode,
        scope,
        title: ctx.title,
        context: ctx.context,
        question: q
      });
      const answer = (res && (res.answer || res.text || res.message)) ? (res.answer || res.text || res.message) : '';
      if (!answer){
        throw new Error(res && res.error ? String(res.error) : 'Empty response');
      }
      msgs.push({ role:'assistant', text:String(answer), mode: mode, ts: Date.now() });
      saveAiChat(state.lessonId, msgs);
      renderAiMessages(msgs);
      hideAiTyping();
      try { if (input) input.disabled = false; } catch {}
      try { if (sendBtn) sendBtn.disabled = false; } catch {}
      setAiStatus('');
    } catch (e){
      hideAiTyping();
      try { if (input) input.disabled = false; } catch {}
      try { if (sendBtn) sendBtn.disabled = false; } catch {}
            const msg = String(e?.message || e);
      if (msg.includes('AI_NOT_CONFIGURED')){
        setAiStatus(t('ai.notConfigured'), true);
      } else {
        if (msg.includes('HTTP 429')){
          setAiStatus(t('ai.rateLimit'), true);
        } else {
          setAiStatus(`${t('ai.error')}: ${msg}`, true);
        }
      }
    }
  }

  const sendBtn = qs('#aiSendBtn');
  if (sendBtn && firstBind) sendBtn.addEventListener('click', () => send());

  // Expose a small API so other UX helpers (selection button) can open and send.
  if (!off.__lhAiApi){
    off.__lhAiApi = {
      open: () => {
        try { bootstrap.Offcanvas.getOrCreateInstance(off).show(); } catch(e) {}
      },
      openAndSend: (text) => {
        try { bootstrap.Offcanvas.getOrCreateInstance(off).show(); } catch(e) {}
        // Small delay so the UI feels smooth.
        setTimeout(() => send(String(text || '')), 60);
      }
    };
  }
  if (input){
    if (firstBind) input.addEventListener('keydown', (ev) => {
      if (ev.ctrlKey && ev.key === 'Enter'){
        ev.preventDefault();
        send();
      }
    });
  }

  // Quick actions
  const qSum = qs('#aiQuickSummary');
  const qSimple = qs('#aiQuickSimple');
  const qQ = qs('#aiQuickQuestions');

  if (qSum && firstBind) qSum.addEventListener('click', () => send(quickPrompt('summary', getUiLang())));
  if (qSimple && firstBind) qSimple.addEventListener('click', () => send(quickPrompt('simple', getUiLang())));
  if (qQ && firstBind) qQ.addEventListener('click', () => send(quickPrompt('questions', getUiLang())));
}

// Show a floating "Ask AI" button when user selects text inside the lesson content.
function initAiSelection(){
  const root = qs('#lessonContent');
  const selBtn = qs('#aiSelectionBtn');
  const off = qs('#aiOffcanvas');
  if (!root || !selBtn || !off) return;
  if (selBtn.__lhBound) {
    // update title on language change
    selBtn.title = t('ai.askSelection.hint');
    return;
  }
  selBtn.__lhBound = true;

  selBtn.title = t('ai.askSelection.hint');

  const isRtl = document.documentElement.getAttribute('dir') === 'rtl';
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const PAD = 8;

  function hide(){
    selBtn.classList.remove('show');
  }

  function getSelectionInRoot(){
    const sel = window.getSelection && window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const txt = String(sel.toString() || '').trim();
    if (!txt || txt.length < 8) return null;
    const range = sel.getRangeAt(0);
    const node = range.commonAncestorContainer;
    const el = node.nodeType === 1 ? node : node.parentElement;
    if (!el || !root.contains(el)) return null;
    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) return null;
    return { txt, rect };
  }

  function position(rect){
    // Prefer above selection; if not enough space, place below.
    let top = rect.top - 44;
    if (top < 68) top = rect.bottom + 10;
    const anchorX = isRtl ? rect.left : rect.right;
    const approxW = 150;
    const left = clamp(anchorX - (isRtl ? approxW : 0), PAD, window.innerWidth - approxW - PAD);
    selBtn.style.left = `${left}px`;
    selBtn.style.top = `${clamp(top, PAD, window.innerHeight - 60)}px`;
  }

  function onSelect(){
    const data = getSelectionInRoot();
    if (!data) { hide(); return; }
    position(data.rect);
    selBtn.classList.add('show');
  }

  // Bind selection events
  root.addEventListener('mouseup', () => setTimeout(onSelect, 0));
  root.addEventListener('touchend', () => setTimeout(onSelect, 0), { passive: true });
  document.addEventListener('scroll', hide, true);
  document.addEventListener('mousedown', (e) => {
    if (!selBtn.contains(e.target)) hide();
  }, true);

  selBtn.addEventListener('click', () => {
    const data = getSelectionInRoot();
    hide();
    if (!data) return;
    const lang = getUiLang();
    // keep it short to avoid token/char limits
    const excerpt = String(data.txt).slice(0, 650);
    const prompt = selectionPrompt(lang, excerpt);
    try {
      const api = off.__lhAiApi;
      if (api && api.openAndSend) api.openAndSend(prompt);
      else {
        try { bootstrap.Offcanvas.getOrCreateInstance(off).show(); } catch(e) {}
      }
    } finally {
      try { const sel = window.getSelection(); sel && sel.removeAllRanges(); } catch(e) {}
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

  await loadNavData(true);
  setupNavAndBreadcrumbs();

  // Update cached course progress (so other pages show badges without extra fetch)
  if (state.courseId && state.courseLessons && state.courseLessons.length){
    const total = state.courseLessons.length;
    const done = state.courseLessons.filter(l => isLessonCompleted(l.lessonId)).length;
    const meta = {
      domainId: state.domainId || state.course?.domainId || '',
      moduleId: state.moduleId || state.course?.moduleId || ''
    };
    saveCourseProgress(state.courseId, done, total, meta);
    upsertCourseMeta(state.courseId, meta);
  }

  render();
  initAiPanel();
  initAiSelection();

  async function onLangChange(){
    // No API reload on language switch; re-render labels only.
    setupNavAndBreadcrumbs();
    render();
    try{ initAiPanel(); }catch(e){}
    try{ initAiSelection(); }catch(e){}
  }
window.__langChangedHook = onLangChange;
window.addEventListener('lang:changed', onLangChange);
}

init();
