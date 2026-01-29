import './admin-mode.js';
import { ensureTopbar } from './layout.js';
import { initI18n, t } from './i18n.js';
import { AI_API_BASE_URL } from './app-config.js';
import { requireAuth, getUser, hasRole } from './auth.js';
import { aiChatOpen } from './api.js';
import { loadAiChat, saveAiChat } from './storage.js';

const CHAT_KEY = 'scan_ai';
const COOLDOWN_KEY = 'scan_ai_429_until';

function hasScanAccess(u){
  if (!u) return false;
  if (hasRole('admin')) return true;
  const v = u.scanAccess;
  return v === true || String(v||'').toLowerCase() === 'true' || String(v||'') === '1' || String(v||'').toLowerCase() === 'yes';
}

function detectScript(text){

  const s = String(text||'');
  const arabic = (s.match(/[\u0600-\u06FF]/g) || []).length;
  const latin = (s.match(/[A-Za-z]/g) || []).length;
  if (arabic === 0 && latin === 0) return 'auto';
  return arabic >= latin ? 'arabic' : 'latin';
}


function detectReplyStyleAuto(q){
  const s = String(q||'');
  // Arabic script => Fusha (or Darija Arabic), but user asked for open + same language
  if ((s.match(/[\u0600-\u06FF]/g)||[]).length > 0) return 'ar_fusha';

  // Arabizi / Darija latin heuristics
  if (/[\d]/.test(s) && /[2375689]/.test(s)) return 'darija';
  const darijaWords = ['wach','bghit','mzyan','kifach','chno','3lach','fash','fin','hadi','dakchi','kayn','salam','slm','labas','kidayr','kifdayr','hamdullah','chokran','mercii','merci'];
  const low = s.toLowerCase();
  if (darijaWords.some(w => low.includes(w))) return 'darija';

  // If UI is Arabic and user writes Latin short text, assume Darija latin
  try{ const ui = (document.documentElement.lang||'').toLowerCase(); if (ui==='ar' && low.length<=30) return 'darija'; }catch{}

  // English heuristics
  const enWords = ['the','what','how','why','when','where','please','can you','could you','explain','example'];
  if (enWords.some(w => low.includes(w))) return 'en';

  // Default French
  return 'fr';
}

function qs(sel){ return document.querySelector(sel); }

function renderMessages(msgs){
  const box = qs('#aiMessages');
  if (!box) return;
  box.innerHTML = '';
  (msgs||[]).forEach(m => {
    const row = document.createElement('div');
    const isAssistant = (m.role === 'assistant');
    row.className = 'ai-msg ' + (isAssistant ? 'assistant' : 'user');

    const bubble = document.createElement('div');
    bubble.className = 'ai-bubble';

    const label = document.createElement('div');
    label.className = 'ai-label small text-muted';
    label.textContent = isAssistant ? t('ai.label.assistant') : t('ai.label.you');

    const text = document.createElement('div');
    text.className = 'ai-text';
    text.textContent = m.text || '';

    bubble.appendChild(label);
    bubble.appendChild(text);
    row.appendChild(bubble);
    box.appendChild(row);
  });
  box.scrollTop = box.scrollHeight;
}

function setProxyInfo(text){
  const el = qs('#aiProxyInfo');
  if (el) el.textContent = text || '';
}

function setHint(text){
  const hint = qs('#aiHint');
  if (hint) hint.textContent = text || '';
}

function setBusy(on){
  const input = qs('#aiInput');
  const btn = qs('#aiSendBtn');
  try { if (input) input.disabled = !!on; } catch {}
  try { if (btn) btn.disabled = !!on; } catch {}
}

/* ---------------- OCR (Tesseract.js) ---------------- */
let stream = null;
let lastImageDataUrl = '';

function setOcrStatus(text){
  const el = qs('#ocrStatus');
  if (el) el.textContent = text || '';
}

function uiToTessLang(uiLang){
  const l = String(uiLang||'fr').toLowerCase();
  if (l === 'ar') return 'ara';
  if (l === 'en') return 'eng';
  return 'fra';
}

async function startCamera(){
  const video = qs('#scanVideo');
  if (!video) return;
  try{
    if (stream){
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
    const constraints = { video: { facingMode: { ideal: 'environment' } }, audio: false };
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    await video.play();
    const cap = qs('#btnCapture');
    if (cap) cap.disabled = false;
    setOcrStatus(t('scan.ready'));
  }catch(e){
    setOcrStatus('⚠️ ' + (e?.message || e));
  }
}

function captureFrame(){
  const video = qs('#scanVideo');
  const canvas = qs('#scanCanvas');
  const preview = qs('#scanPreview');
  if (!video || !canvas) return;
  const w = video.videoWidth || 1280;
  const h = video.videoHeight || 720;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, w, h);
  lastImageDataUrl = canvas.toDataURL('image/png');
  if (preview){
    preview.src = lastImageDataUrl;
    preview.classList.remove('d-none');
  }
  const ocrBtn = qs('#btnOcr');
  if (ocrBtn) ocrBtn.disabled = !lastImageDataUrl;
  const retakeBtn = qs('#btnRetake');
  if (retakeBtn) retakeBtn.disabled = !lastImageDataUrl;
  setOcrStatus(t('scan.captured'));
}

async function runOcr(){
  if (!lastImageDataUrl){
    setOcrStatus(t('scan.noImage'));
    return;
  }
  const out = qs('#ocrText');
  const uiLang = document.documentElement.lang || 'fr';
  const tessLang = uiToTessLang(uiLang);

  const btn = qs('#btnOcr');
  if (btn) btn.disabled = true;
  setOcrStatus(t('scan.working'));

  try{
    // Tesseract is loaded globally (UMD)
    const res = await window.Tesseract.recognize(lastImageDataUrl, tessLang, {
      logger: m => {
        if (m && m.status){
          const p = (m.progress != null) ? Math.round(m.progress * 100) : null;
          setOcrStatus(`${m.status}${p!=null ? ' ' + p + '%' : ''}`);
        }
      }
    });
    const text = (res && res.data && res.data.text) ? String(res.data.text).trim() : '';
    if (out) out.value = text;
    setOcrStatus(text ? t('scan.done') : t('scan.empty'));
  }catch(e){
    setOcrStatus('⚠️ ' + (e?.message || e));
  }finally{
    if (btn) btn.disabled = false;
  }
}

async function copyOcrText(){
  const out = qs('#ocrText');
  const text = String(out?.value || '');
  if (!text) return;
  try{
    await navigator.clipboard.writeText(text);
    setOcrStatus(t('scan.copied'));
  }catch{
    // fallback
    try{ out.select(); document.execCommand('copy'); setOcrStatus(t('scan.copied')); }catch{}
  }
}

function pasteToAi(){
  const out = qs('#ocrText');
  const ai = qs('#aiInput');
  if (!ai) return;
  const text = String(out?.value || '').trim();
  if (!text) return;
  ai.value = text;
  ai.focus();
}

function retake(){
  const preview = qs('#scanPreview');
  lastImageDataUrl = '';
  if (preview){ preview.src=''; preview.classList.add('d-none'); }
  const ocrBtn = qs('#btnOcr');
  if (ocrBtn) ocrBtn.disabled = true;
  const retakeBtn = qs('#btnRetake');
  if (retakeBtn) retakeBtn.disabled = true;
  setOcrStatus(t('scan.ready'));
}

function clearScan(){
  const out = qs('#ocrText');
  const preview = qs('#scanPreview');
  lastImageDataUrl = '';
  if (out) out.value = '';
  if (preview){ preview.src=''; preview.classList.add('d-none'); }
  const ocrBtn = qs('#btnOcr');
  if (ocrBtn) ocrBtn.disabled = true;
  const retakeBtn = qs('#btnRetake');
  if (retakeBtn) retakeBtn.disabled = true;
  setOcrStatus('');
}

function clearChat(){
  try{ saveAiChat(CHAT_KEY, []); }catch{}
  try{ localStorage.removeItem('lh_ai_chat_'+CHAT_KEY); }catch{}
  renderMessages([]);
  setHint(t('ai.hint.ctrlEnter'));
}

/* ---------------- Page init ---------------- */
(async function(){
  requireAuth({ roles: ['student','admin'] });
  await ensureTopbar({ showSearch: false });
  await initI18n();

  const u = getUser();
  if (!hasScanAccess(u)){
    window.location.href = 'home.html';
    return;
  }

  // Show AI proxy build (helps debugging deployments)
  try{
    const base = String(AI_API_BASE_URL || '').trim();
    const masked = base ? base.replace(/^(.{22}).*(.{10})$/, '$1…$2') : t('ai.proxy.notSet');
    let build = 'n/a';
    let extra = '';
    try{
      const h = await aiHealth();
      if (h && h.ok){
        build = h.build || 'n/a';
      }else if (h && h.error){
        build = 'ERR';
        extra = ` · ${h.error}`;
      }else{
        build = 'ERR';
      }
    }catch(e){
      build = 'ERR';
    }
    setProxyInfo(`${t('ai.proxy')}: ${masked} · ${t('ai.build')}: ${build}${extra}`);
  }catch{}

  // i18n placeholders
  const ocrText = qs('#ocrText');
  if (ocrText) ocrText.placeholder = t('scan.placeholder');
  const aiInput = qs('#aiInput');
  if (aiInput) aiInput.placeholder = t('ai.placeholder');
  setHint(t('ai.hint.ctrlEnter'));

  // Bind OCR UI
  qs('#btnStartCam')?.addEventListener('click', startCamera);
  qs('#btnCapture')?.addEventListener('click', captureFrame);
  qs('#btnRetake')?.addEventListener('click', retake);
  qs('#btnOcr')?.addEventListener('click', runOcr);
  qs('#btnCopyText')?.addEventListener('click', copyOcrText);
  qs('#btnPasteToAi')?.addEventListener('click', pasteToAi);
  qs('#btnClearScan')?.addEventListener('click', clearScan);
  qs('#btnClearChat')?.addEventListener('click', clearChat);

  // Default to Open mode on this page
  try{ const m = qs('#aiMode'); if (m) m.value = 'open'; }catch{}

  // Load chat history
  const msgs = loadAiChat(CHAT_KEY) || [];
  renderMessages(msgs);

  async function send(){
    const q = String(aiInput?.value || '').trim();
    if (!q) return;

    const uiLang = document.documentElement.lang || 'fr';
    const mode = String(qs('#aiMode')?.value || 'explain');
    const replyStyleSel = String(qs('#aiReplyStyle')?.value || 'auto');
    const script = detectScript(q);
    const replyStyle = (replyStyleSel === 'auto') ? detectReplyStyleAuto(q) : replyStyleSel;

    const cooldownUntil = Number(localStorage.getItem(COOLDOWN_KEY) || '0');
    if (cooldownUntil && Date.now() < cooldownUntil){
      const waitSec = Math.ceil((cooldownUntil - Date.now())/1000);
      msgs.push({ role:'assistant', text: t('ai.error.rateLimit') + ` (${waitSec}s)`, mode, ts: Date.now() });
      saveAiChat(CHAT_KEY, msgs);
      renderMessages(msgs);
      return;
    }

    msgs.push({ role:'user', text:q, mode, ts: Date.now() });
    saveAiChat(CHAT_KEY, msgs);
    renderMessages(msgs);

    setBusy(true);
    setHint(t('ai.thinking'));

    try{
      const res = await aiChatOpen({
        lang: uiLang,
        mode,
        
        question: q,
        replyStyle,
        script
      });
      const answer = (res && (res.answer || res.text || res.message)) ? (res.answer || res.text || res.message) : '';
      const aLow = String(answer||'').toLowerCase();
      if (aLow.includes('context of the lesson') || aLow.includes('contexte de la') || aLow.includes('pas couverte')){
        throw new Error('LESSON_FALLBACK');
      }
      if (!answer) throw new Error(res && res.error ? String(res.error) : 'Empty response');

      msgs.push({ role:'assistant', text:String(answer), mode, ts: Date.now() });
      saveAiChat(CHAT_KEY, msgs);
      renderMessages(msgs);
      aiInput.value = '';
      setHint(t('ai.hint.ctrlEnter'));
    }catch(e){
      const emsg = String(e?.message || e);
      const is429 = emsg.includes('429') || emsg.toLowerCase().includes('rate') || emsg.toLowerCase().includes('quota');
      const friendly = (emsg === 'LESSON_FALLBACK') ? t('ai.error.lessonFallback') : ((emsg.toLowerCase().includes('unknown action')) ? t('ai.error.outdatedProxy') : ('⚠️ ' + emsg));
      msgs.push({ role:'assistant', text: friendly, mode, ts: Date.now() });
      saveAiChat(CHAT_KEY, msgs);
      renderMessages(msgs);
      setHint(t('ai.hint.ctrlEnter'));
    }finally{
      setBusy(false);
    }
  }

  qs('#aiSendBtn')?.addEventListener('click', send);
  aiInput?.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter'){
      e.preventDefault();
      send();
    }
  });
})();