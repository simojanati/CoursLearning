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
let fullImageDataUrl = '';
let workingImageDataUrl = '';
let cropRect = null; // {x,y,w,h} in image pixels
let cropImg = null;
let cropListenersBound = false;
let enhanceOn = false;
let contrastValue = 1.4;


function setOcrStatus(text){
  const el = qs('#ocrStatus');
  if (el) el.textContent = text || '';
}

function loadImageDataUrl(dataUrl){
  return new Promise((resolve, reject)=>{
    const img = new Image();
    img.onload = ()=> resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}
function clamp255(v){ return v < 0 ? 0 : (v > 255 ? 255 : v); }

function applyEnhanceToCanvas_(ctx, w, h, contrast){
  const imgData = ctx.getImageData(0,0,w,h);
  const d = imgData.data;
  const c = Number(contrast || 1.4);
  for (let i=0;i<d.length;i+=4){
    const r=d[i], g=d[i+1], b=d[i+2];
    let y = 0.299*r + 0.587*g + 0.114*b;
    y = (y - 128) * c + 128;
    y = clamp255(y);
    d[i]=d[i+1]=d[i+2]=y;
  }
  ctx.putImageData(imgData,0,0);
}

function setEditControlsEnabled(on){
  qs('#btnApplyCrop') && (qs('#btnApplyCrop').disabled = !on);
  qs('#btnResetCrop') && (qs('#btnResetCrop').disabled = !on);
  qs('#enhanceToggle') && (qs('#enhanceToggle').disabled = !on);
  qs('#contrastRange') && (qs('#contrastRange').disabled = !on);
}

function getPointOnCanvas_(canvas, clientX, clientY){
  const rect = canvas.getBoundingClientRect();
  const x = (clientX - rect.left) * (canvas.width / rect.width);
  const y = (clientY - rect.top) * (canvas.height / rect.height);
  return { x, y };
}

function drawCropEditor_(){
  const canvas = qs('#cropCanvas');
  if (!canvas || !cropImg) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(cropImg,0,0);

  if (enhanceOn){
    applyEnhanceToCanvas_(ctx, canvas.width, canvas.height, contrastValue);
  }

  const r = cropRect || { x:0, y:0, w: canvas.width, h: canvas.height };
  cropRect = r;

  // dark overlay outside selection
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.rect(0,0,canvas.width,canvas.height);
  ctx.rect(r.x,r.y,r.w,r.h);
  ctx.fill('evenodd');
  ctx.restore();

  // border
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = Math.max(2, Math.round(canvas.width/400));
  ctx.strokeRect(r.x,r.y,r.w,r.h);
  ctx.restore();
}

async function showCropEditor(){
  const canvas = qs('#cropCanvas');
  const preview = qs('#scanPreview');
  if (!canvas || !workingImageDataUrl) return;

  cropImg = await loadImageDataUrl(workingImageDataUrl);
  canvas.width = cropImg.naturalWidth;
  canvas.height = cropImg.naturalHeight;

  // default selection = full image
  cropRect = cropRect || { x:0, y:0, w: canvas.width, h: canvas.height };

  // show canvas editor, hide preview
  preview && preview.classList.add('d-none');
  canvas.classList.remove('d-none');
  setEditControlsEnabled(true);
  drawCropEditor_();

  if (!cropListenersBound){
    cropListenersBound = true;
    let dragging=false;
    let start=null;

    const down = (ev)=>{
      const p = (ev.touches && ev.touches[0]) ? ev.touches[0] : ev;
      dragging = true;
      start = getPointOnCanvas_(canvas, p.clientX, p.clientY);
      ev.preventDefault();
    };
    const move = (ev)=>{
      if (!dragging || !start) return;
      const p = (ev.touches && ev.touches[0]) ? ev.touches[0] : ev;
      const cur = getPointOnCanvas_(canvas, p.clientX, p.clientY);
      let x = Math.min(start.x, cur.x);
      let y = Math.min(start.y, cur.y);
      let w = Math.abs(cur.x - start.x);
      let h = Math.abs(cur.y - start.y);
      const min = 40;
      if (w < min) w = min;
      if (h < min) h = min;
      if (x < 0) x = 0;
      if (y < 0) y = 0;
      if (x + w > canvas.width) w = canvas.width - x;
      if (y + h > canvas.height) h = canvas.height - y;
      cropRect = { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
      drawCropEditor_();
      ev.preventDefault();
    };
    const up = ()=>{ dragging=false; start=null; };

    canvas.addEventListener('mousedown', down);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);

    canvas.addEventListener('touchstart', down, { passive:false });
    window.addEventListener('touchmove', move, { passive:false });
    window.addEventListener('touchend', up);
  }
}

async function applyCrop(){
  if (!workingImageDataUrl || !cropRect) return;
  const img = await loadImageDataUrl(workingImageDataUrl);
  const c = document.createElement('canvas');
  c.width = cropRect.w;
  c.height = cropRect.h;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, cropRect.x, cropRect.y, cropRect.w, cropRect.h, 0, 0, cropRect.w, cropRect.h);
  workingImageDataUrl = c.toDataURL('image/png');
  cropRect = null;
  await showCropEditor();
  qs('#btnOcr') && (qs('#btnOcr').disabled = false);
  setOcrStatus(t('scan.cropped'));
}

async function resetCrop(){
  if (!fullImageDataUrl) return;
  workingImageDataUrl = fullImageDataUrl;
  cropRect = null;
  await showCropEditor();
  setOcrStatus(t('scan.cropResetDone'));
}

async function getProcessedDataUrl(){
  const base = workingImageDataUrl || lastImageDataUrl;
  if (!base) return '';
  const img = await loadImageDataUrl(base);
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d');
  ctx.drawImage(img,0,0);
  if (enhanceOn){
    applyEnhanceToCanvas_(ctx, c.width, c.height, contrastValue);
  }
  return c.toDataURL('image/png');
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

async function captureFrame(){
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
  fullImageDataUrl = lastImageDataUrl;
  workingImageDataUrl = lastImageDataUrl;
  cropRect = null;
  try{ await showCropEditor(); }catch{}
  setEditControlsEnabled(true);

  if (preview){
    preview.src = workingImageDataUrl || lastImageDataUrl;
    // crop editor uses canvas; keep preview hidden
    preview.classList.add('d-none');
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
    const imgDataUrl = await getProcessedDataUrl();
    const res = await window.Tesseract.recognize(imgDataUrl, tessLang, {
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
  const cropCanvas = qs('#cropCanvas');
  if (cropCanvas) cropCanvas.classList.add('d-none');

  const preview = qs('#scanPreview');
  lastImageDataUrl = '';
  fullImageDataUrl = '';
  workingImageDataUrl = '';
  cropRect = null;
  cropImg = null;
  setEditControlsEnabled(false);

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
  fullImageDataUrl = '';
  workingImageDataUrl = '';
  cropRect = null;
  cropImg = null;
  setEditControlsEnabled(false);

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
  await ensureTopbar({ showSearch: true, searchPlaceholderKey: 'courses.searchPlaceholder' });
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