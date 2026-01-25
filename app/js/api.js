import { API_BASE_URL, USE_MOCK_DATA, SPREADSHEET_ID, AI_API_BASE_URL } from './app-config.js';
import { mockCourses, mockLessons, mockQuizzes } from './mock-data.js';

function _normOrder(v){
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function _cmpOrderThen(a, b, fallbackKey){
  const ao = _normOrder(a?.order);
  const bo = _normOrder(b?.order);
  if (ao != null && bo != null && ao !== bo) return ao - bo;
  if (ao != null && bo == null) return -1;
  if (ao == null && bo != null) return 1;
  // stable deterministic fallback
  const ak = String(a?.[fallbackKey] || '').toLowerCase();
  const bk = String(b?.[fallbackKey] || '').toLowerCase();
  return ak.localeCompare(bk);
}

function buildUrl(action, params = {}){
  const url = new URL(API_BASE_URL);
  url.searchParams.set('action', action);
  if (SPREADSHEET_ID && String(SPREADSHEET_ID).trim().length){
    url.searchParams.set('spreadsheetId', String(SPREADSHEET_ID).trim());
  }
  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, String(v)));
  return url;
}

function jsonp(action, params = {}) {
  return new Promise((resolve, reject) => {
    const cbName = `__jsonp_${Math.random().toString(16).slice(2)}`;
    const url = buildUrl(action, params);
    url.searchParams.set('callback', cbName);
    url.searchParams.set('_ts', Date.now().toString());

    const cleanup = () => {
      try { delete window[cbName]; } catch {}
      script.remove();
    };

    const script = document.createElement('script');
    script.src = url.toString();
    script.async = true;

    window[cbName] = (data) => {
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error('JSONP error'));
    };

    document.head.appendChild(script);

    setTimeout(() => {
      // timeout safety
      if (window[cbName]) {
        cleanup();
        reject(new Error('JSONP timeout'));
      }
    }, 45000);
  });
}

function jsonpUrl(url) {
  return new Promise((resolve, reject) => {
    const cbName = `__jsonp_${Math.random().toString(16).slice(2)}`;
    url.searchParams.set('callback', cbName);
    url.searchParams.set('_ts', Date.now().toString());

    const cleanup = () => {
      try { delete window[cbName]; } catch {}
      script.remove();
    };

    const script = document.createElement('script');
    script.src = url.toString();
    script.async = true;

    window[cbName] = (data) => {
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error('JSONP error'));
    };

    document.head.appendChild(script);

    setTimeout(() => {
      if (window[cbName]) {
        cleanup();
        reject(new Error('JSONP timeout'));
      }
    }, 45000);
  });
}

async function fetchJson(action, params = {}) {
  const url = buildUrl(action, params);
  const res = await fetch(url.toString(), { method: 'GET' });
  if (!res.ok) throw new Error(`API error (${res.status})`);
  return res.json();
}

function buildAiUrl(action, params = {}){
  const base = (AI_API_BASE_URL && String(AI_API_BASE_URL).trim().length) ? AI_API_BASE_URL : '';
  if (!base){
    throw new Error('AI proxy not configured. Set AI_API_BASE_URL in app-config.js');
  }
  const url = new URL(base);
  url.searchParams.set('action', action);
  if (SPREADSHEET_ID && String(SPREADSHEET_ID).trim().length){
    url.searchParams.set('spreadsheetId', String(SPREADSHEET_ID).trim());
  }
  Object.entries(params || {}).forEach(([k,v]) => {
    if (v === undefined || v === null) return;
    url.searchParams.set(k, String(v));
  });
  return url;
}

async function apiCall(action, params = {}) {
  // Show global loader while API is in-flight (even via JSONP fallback)
  try { window.dispatchEvent(new CustomEvent('lh:loading', { detail: { on: true } })); } catch(e) {}

  try {
    // Try fetch first; if CORS blocks, fallback to JSONP.
    try {
      const data = await fetchJson(action, params);
      if (data && data.error){
        const extra = data.message ? (': ' + String(data.message)) : '';
        throw new Error(String(data.error) + extra);
      }
      return data;
    } catch (e) {
      const data = await jsonp(action, params);
      if (data && data.error){
        const extra = data.message ? (': ' + String(data.message)) : '';
        throw new Error(String(data.error) + extra);
      }
      return data;
    }
  } finally {
    try { window.dispatchEvent(new CustomEvent('lh:loading', { detail: { on: false } })); } catch(e) {}
  }
}


export async function getDomains(){
  if (USE_MOCK_DATA) return [];
  const data = await apiCall('domains');
  return (data.domains||[]).sort((a,b)=> _cmpOrderThen(a,b,'domainId'));
}

export async function getModules(domainId=''){
  if (USE_MOCK_DATA) return [];
  const params = {};
  if (domainId && domainId !== 'all') params.domainId = domainId;
  const data = await apiCall('modules', params);
  return (data.modules||[]).sort((a,b)=> _cmpOrderThen(a,b,'moduleId'));
}

export async function getCourses(filters = {}){
  if (USE_MOCK_DATA) return [...mockCourses].sort((a,b)=> (a.order??0)-(b.order??0));
  const params = {};
  if (filters.domainId && filters.domainId !== 'all') params.domainId = filters.domainId;
  if (filters.moduleId && filters.moduleId !== 'all') params.moduleId = filters.moduleId;
  const data = await apiCall('courses', params);
  return (data.courses||[]).sort((a,b)=> _cmpOrderThen(a,b,'courseId'));
}

export async function getCourse(courseId){
  if (USE_MOCK_DATA) return mockCourses.find(c => c.courseId === courseId) || null;
  const data = await apiCall('course', { courseId });
  return data.course || null;
}

export async function getLessons(courseId){
  if (USE_MOCK_DATA) return mockLessons.filter(l => l.courseId === courseId).sort((a,b)=> (a.order??0)-(b.order??0));
  const data = await apiCall('lessons', { courseId });
  return (data.lessons||[]).sort((a,b)=> _cmpOrderThen(a,b,'lessonId'));
}

export async function getLesson(lessonId){
  if (USE_MOCK_DATA) return mockLessons.find(l => l.lessonId === lessonId) || null;
  const data = await apiCall('lesson', { lessonId });
  return data.lesson || null;
}

export async function getQuizByLesson(lessonId){
  if (USE_MOCK_DATA) return mockQuizzes.find(q => q.lessonId === lessonId) || null;
  const data = await apiCall('quiz', { lessonId });
  const quiz = data.quiz || null;
  // Apps Script returns questions separately: { quiz, questions }
  if (quiz){
    quiz.questions = data.questions || quiz.questions || [];
    // normalize numeric fields (defensive)
    if (quiz.passingScore != null) quiz.passingScore = Number(quiz.passingScore) || 0;
  }
  return quiz;
}


export async function getHealth(){
  if (USE_MOCK_DATA){
    // Minimal mock: assume OK
    return {
      ok: true,
      sheets: {
        Courses: { exists: true, missingHeaders: [] },
        Lessons: { exists: true, missingHeaders: [] },
        Quizzes: { exists: true, missingHeaders: [] },
        Questions: { exists: true, missingHeaders: [] }
      },
      counts: { courses: mockCourses.length, lessons: mockLessons.length, quizzes: mockQuizzes.length, questions: 0 },
      checks: [{ level: 'ok', code: 'MOCK_MODE', message: 'Mock mode enabled' }]
    };
  }
  return await apiCall('health', {});
}


// AI assistant (via Apps Script)
export async function aiChat({ lessonId, lang, mode, question, title, context, scope }){
  const q = String(question || '').trim();
  const m = String(mode || '').trim() || 'explain';
  const l = String(lang || '').trim() || 'fr';
  const t = String(title || '').trim();
  const c = String(context || '').trim();
  const s = String(scope || '').trim(); // 'lesson'|'general'
  if (!q) throw new Error('Empty question');
  const url = buildAiUrl('aiChat', {
    lessonId: String(lessonId||''),
    lang: l,
    mode: m,
    scope: s,
    title: t,
    context: c,
    q: q
  });
  const data = await jsonpUrl(url);
  if (data && data.error){
    const extra = data.message ? (': ' + String(data.message)) : '';
    throw new Error(String(data.error) + extra);
  }
  return data;
}


// -------------------- Platform settings (optional) --------------------
export function fetchPlatformSettings(lang = 'fr') {
  const base = window.APP_CONFIG?.API_BASE_URL || window.API_BASE_URL || '';
  if (!base) return Promise.resolve(null);

  return new Promise((resolve) => {
    jsonpUrl(`${base}?action=platformSettings&lang=${encodeURIComponent(lang)}`, (data) => {
      resolve(data?.settings || null);
    }, () => resolve(null));
  });
}


export async function searchAll(q, limit=20){
  if (!q) return { domains:[], modules:[], courses:[], lessons:[] };
  const data = await apiCall('search', { q, limit });
  return {
    domains: data.domains || [],
    modules: data.modules || [],
    courses: data.courses || [],
    lessons: data.lessons || [],
  };
}
