import './admin-mode.js';
import { ensureTopbar } from './layout.js';
import { initI18n, t } from './i18n.js';
import { requireAuth, getUser, hasRole } from './auth.js';
import { aiChat } from './api.js';
import { loadAiChat, saveAiChat } from './storage.js';

const CHAT_KEY = 'scan_ai';

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

function qs(sel){ return document.querySelector(sel); }

function renderMessages(msgs){
  const box = qs('#aiMessages');
  if (!box) return;
  box.innerHTML = '';
  (msgs||[]).forEach(m => {
    const div = document.createElement('div');
    div.className = 'ai-msg ' + (m.role === 'assistant' ? 'ai-msg-assistant' : 'ai-msg-user');
    div.textContent = m.text || '';
    box.appendChild(div);
  });
  box.scrollTop = box.scrollHeight;
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
  setOcrStatus(t('scan.captured'));
}

async function runOcr(){
  if (!lastImageDataUrl){
    setOcrStatus(t('scan.noImage'));
    return;
  }
  const out = qs('#ocrText');
  const langSel = qs('#ocrLang');
  const uiLang = document.documentElement.lang || 'fr';
  const selected = String(langSel?.value || 'auto');
  const tessLang = (selected === 'auto') ? uiToTessLang(uiLang) : selected;

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

function clearScan(){
  const out = qs('#ocrText');
  const preview = qs('#scanPreview');
  lastImageDataUrl = '';
  if (out) out.value = '';
  if (preview){ preview.src=''; preview.classList.add('d-none'); }
  const ocrBtn = qs('#btnOcr');
  if (ocrBtn) ocrBtn.disabled = true;
  setOcrStatus('');
}

/* ---------------- Page init ---------------- */
(async function(){
  await initI18n();
  await ensureTopbar({ showSearch: false });
  requireAuth({ roles: ['student','admin'] });

  const u = getUser();
  if (!hasScanAccess(u)){
    window.location.href = 'home.html';
    return;
  }

  // i18n placeholders
  const ocrText = qs('#ocrText');
  if (ocrText) ocrText.placeholder = t('scan.placeholder');
  const aiInput = qs('#aiInput');
  if (aiInput) aiInput.placeholder = t('ai.placeholder');
  setHint(t('ai.hint.open'));

  // Bind OCR UI
  qs('#btnStartCam')?.addEventListener('click', startCamera);
  qs('#btnCapture')?.addEventListener('click', captureFrame);
  qs('#btnOcr')?.addEventListener('click', runOcr);
  qs('#btnCopyText')?.addEventListener('click', copyOcrText);
  qs('#btnPasteToAi')?.addEventListener('click', pasteToAi);
  qs('#btnClearScan')?.addEventListener('click', clearScan);

  // Load chat history
  const msgs = loadAiChat(CHAT_KEY) || [];
  renderMessages(msgs);

  async function send(){
    const q = String(aiInput?.value || '').trim();
    if (!q) return;

    const uiLang = document.documentElement.lang || 'fr';
    const mode = String(qs('#aiMode')?.value || 'explain');
    const replyStyle = String(qs('#aiReplyStyle')?.value || 'auto');
    const script = detectScript(q);
    const scope = (mode === 'open') ? 'open' : 'general';

    msgs.push({ role:'user', text:q, mode, ts: Date.now() });
    saveAiChat(CHAT_KEY, msgs);
    renderMessages(msgs);

    setBusy(true);
    setHint(t('ai.thinking'));

    try{
      const res = await aiChat({
        lessonId: '',
        lang: uiLang,
        mode,
        scope,
        title: '',
        context: '',
        question: q,
        replyStyle,
        script
      });
      const answer = (res && (res.answer || res.text || res.message)) ? (res.answer || res.text || res.message) : '';
      if (!answer) throw new Error(res && res.error ? String(res.error) : 'Empty response');

      msgs.push({ role:'assistant', text:String(answer), mode, ts: Date.now() });
      saveAiChat(CHAT_KEY, msgs);
      renderMessages(msgs);
      aiInput.value = '';
      setHint(t('ai.hint.open'));
    }catch(e){
      msgs.push({ role:'assistant', text: '⚠️ ' + String(e?.message || e), mode, ts: Date.now() });
      saveAiChat(CHAT_KEY, msgs);
      renderMessages(msgs);
      setHint(t('ai.hint.open'));
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