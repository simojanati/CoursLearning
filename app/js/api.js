import { API_BASE_URL, USE_MOCK_DATA, SPREADSHEET_ID } from './app-config.js';
import { mockCourses, mockLessons, mockQuizzes } from './mock-data.js';

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
    }, 10000);
  });
}

async function fetchJson(action, params = {}) {
  const url = buildUrl(action, params);
  const res = await fetch(url.toString(), { method: 'GET' });
  if (!res.ok) throw new Error(`API error (${res.status})`);
  return res.json();
}

async function apiCall(action, params = {}) {
  // Try fetch first; if CORS blocks, fallback to JSONP.
  try {
    const data = await fetchJson(action, params);
    if (data && data.error) throw new Error(String(data.error));
    return data;
  } catch (e) {
    const data = await jsonp(action, params);
    if (data && data.error) throw new Error(String(data.error));
    return data;
  }
}

export async function getCourses(){
  if (USE_MOCK_DATA) return [...mockCourses].sort((a,b)=> (a.order??0)-(b.order??0));
  const data = await apiCall('courses');
  return (data.courses||[]).sort((a,b)=> (a.order??0)-(b.order??0));
}

export async function getCourse(courseId){
  if (USE_MOCK_DATA) return mockCourses.find(c => c.courseId === courseId) || null;
  const data = await apiCall('course', { courseId });
  return data.course || null;
}

export async function getLessons(courseId){
  if (USE_MOCK_DATA) return mockLessons.filter(l => l.courseId === courseId).sort((a,b)=> (a.order??0)-(b.order??0));
  const data = await apiCall('lessons', { courseId });
  return (data.lessons||[]).sort((a,b)=> (a.order??0)-(b.order??0));
}

export async function getLesson(lessonId){
  if (USE_MOCK_DATA) return mockLessons.find(l => l.lessonId === lessonId) || null;
  const data = await apiCall('lesson', { lessonId });
  return data.lesson || null;
}

export async function getQuizByLesson(lessonId){
  if (USE_MOCK_DATA) return mockQuizzes.find(q => q.lessonId === lessonId) || null;
  const data = await apiCall('quiz', { lessonId });
  return data.quiz || null;
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
