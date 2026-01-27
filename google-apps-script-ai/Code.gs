/**
 * VBA Eco Academy - AI Proxy (Apps Script Web App)
 *
 * This proxy is deployed separately from the data API to keep GitHub Pages static and secure.
 *
 * Script Properties (Project Settings > Script properties):
 * - AI_PROVIDER: "gemini" | "groq" | "openai"   (default: gemini)
 *
 * Gemini:
 * - GEMINI_API_KEY
 * - GEMINI_MODEL (default: gemini-2.5-flash)
 *
 * Groq (OpenAI-compatible):
 * - GROQ_API_KEY
 * - GROQ_MODEL (default: llama-3.1-8b-instant)
 *
 * OpenAI (paid):
 * - OPENAI_API_KEY
 * - OPENAI_MODEL (default: gpt-4o-mini)
 * Optional (OpenAI):
 * - OPENAI_ORG_ID
 * - OPENAI_PROJECT_ID
 *
 * Query params (JSONP friendly):
 * - action=aiChat
 * - lang=fr|en|ar
 * - mode=explain|examples|exercises|mini_quiz|review
 * - title=...
 * - context=... (plain text)
 * - q=...
 * - callback=cb
 */

function doGet(e){
  const p = (e && e.parameter) ? e.parameter : {};
  const cb = p.callback || '';
  let payload;
  try{
    const action = String(p.action || '');
    if(action === 'aiChat'){
      payload = aiChat_(p);
    } else if(action === 'health'){
      payload = { ok: true, provider: getProp_('AI_PROVIDER', 'gemini') };
    } else {
      payload = { error: 'Unknown action' };
    }
  }catch(err){
    payload = { error: String(err && err.message ? err.message : err) };
  }
  return output_(payload, cb);
}

function output_(payload, callback){
  const json = JSON.stringify(payload);
  if(callback && String(callback).trim() !== ''){
    const cb = String(callback).replace(/[^a-zA-Z0-9_\.]/g, '');
    return ContentService.createTextOutput(`${cb}(${json});`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function aiChat_(params){
  const lang = (params.lang || 'fr').toString().trim();
  const mode = (params.mode || 'explain').toString().trim();
  const scope = (params.scope || 'lesson').toString().trim(); // lesson|general
  const title = (params.title || '').toString().trim();
  const context = (params.context || '').toString().trim();
  const q = (params.q || '').toString().trim();

  if(!q) return { error: 'Missing q' };

  const system = (scope === 'general')
    ? "You are a helpful tutor. Use the lesson context as primary reference, but you MAY answer broader questions too. If you go beyond the lesson, clearly say so and keep it concise."
    : "You are a helpful tutor. Answer ONLY using the provided lesson context. If the question is not covered by the lesson, say so and suggest what to review in the lesson.";
  const user = [
    `Lang: ${lang}`,
    `Mode: ${mode}`,
    `Scope: ${scope}`,
    title ? `Lesson title: ${title}` : '',
    context ? `Lesson context:\n${context}` : '',
    `Student question:\n${q}`
  ].filter(Boolean).join("\n\n");

  const provider = getProp_('AI_PROVIDER', 'gemini').toLowerCase();

  if(provider === 'gemini') return callGemini_(system, user);
  if(provider === 'groq') return callGroq_(system, user);
  if(provider === 'openai') return callOpenAI_(system, user);

  return { error: `Unsupported AI_PROVIDER: ${provider}` };
}

/* ------------------------- Providers ------------------------- */

function callGemini_(system, user){
  const key = getProp_('GEMINI_API_KEY', '').trim();
  if(!key) return { error: 'AI_NOT_CONFIGURED: missing GEMINI_API_KEY' };

  const model = getProp_('GEMINI_MODEL', 'gemini-2.5-flash').trim();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: { temperature: 0.4 }
  };

  const res = fetchWithRetry_(url, {
    method: "post",
    contentType: "application/json",
    headers: { "x-goog-api-key": key },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });

  const status = res.getResponseCode();
  const text = res.getContentText();

  if(status < 200 || status >= 300){
    return { error: `Gemini HTTP ${status}`, details: text };
  }

  const data = JSON.parse(text || "{}");
  const answer =
    (data.candidates && data.candidates[0] &&
     data.candidates[0].content && data.candidates[0].content.parts &&
     data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text) || "";

  return { answer: String(answer).trim() };
}

function callGroq_(system, user){
  const key = getProp_('GROQ_API_KEY', '').trim();
  if(!key) return { error: 'AI_NOT_CONFIGURED: missing GROQ_API_KEY' };

  const model = getProp_('GROQ_MODEL', 'llama-3.1-8b-instant').trim();
  const url = "https://api.groq.com/openai/v1/chat/completions";

  const body = {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    temperature: 0.4
  };

  const res = fetchWithRetry_(url, {
    method: "post",
    contentType: "application/json",
    headers: { "Authorization": "Bearer " + key },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });

  const status = res.getResponseCode();
  const text = res.getContentText();

  if(status < 200 || status >= 300){
    return { error: `Groq HTTP ${status}`, details: text };
  }

  const data = JSON.parse(text || "{}");
  const answer = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
  return { answer: String(answer).trim() };
}

function callOpenAI_(system, user){
  const key = getProp_('OPENAI_API_KEY', '').trim();
  if(!key) return { error: 'AI_NOT_CONFIGURED: missing OPENAI_API_KEY' };

  const model = getProp_('OPENAI_MODEL', 'gpt-4o-mini').trim();
  const url = "https://api.openai.com/v1/chat/completions";

  const org = getProp_('OPENAI_ORG_ID', '').trim();
  const proj = getProp_('OPENAI_PROJECT_ID', '').trim();

  const headers = { "Authorization": "Bearer " + key };
  if(org) headers["OpenAI-Organization"] = org;
  if(proj) headers["OpenAI-Project"] = proj;

  const body = {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    temperature: 0.4
  };

  const res = fetchWithRetry_(url, {
    method: "post",
    contentType: "application/json",
    headers,
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });

  const status = res.getResponseCode();
  const text = res.getContentText();

  if(status < 200 || status >= 300){
    return { error: `OpenAI HTTP ${status}`, details: text };
  }

  const data = JSON.parse(text || "{}");
  const answer = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
  return { answer: String(answer).trim() };
}

/* ------------------------- Helpers ------------------------- */

function getProp_(k, def){
  const v = PropertiesService.getScriptProperties().getProperty(k);
  return (v === null || v === undefined || String(v).trim() === '') ? def : String(v);
}

/**
 * Retry on 429 + 5xx with exponential backoff.
 */
function fetchWithRetry_(url, options){
  const maxRetries = 5;
  let attempt = 0;
  while(true){
    const res = UrlFetchApp.fetch(url, options);
    const status = res.getResponseCode();

    const shouldRetry = (status === 429) || (status >= 500 && status <= 599);
    if(!shouldRetry || attempt >= maxRetries){
      return res;
    }
    // Exponential backoff: 0.8s, 1.6s, 3.2s, 6.4s, 12.8s (+ jitter)
    const base = 800 * Math.pow(2, attempt);
    const jitter = Math.floor(Math.random() * 250);
    Utilities.sleep(base + jitter);
    attempt++;
  }
}


// Run this once from the Apps Script editor to grant MailApp permissions.
function authorizeMail_(){
  MailApp.getRemainingDailyQuota();
  return true;
}

function telegramTest_() {
  notifyTelegram_('✅ <b>LearnHub</b> Telegram test message.');
  return { ok: true, sent: true, at: new Date().toISOString() };
}
