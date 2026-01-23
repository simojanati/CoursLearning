/**
 * VBA Eco Academy - Google Apps Script API (bilingual FR/EN for content)
 *
 * Sheets (tabs) + headers (row 1):
 * - Courses  : courseId, title_fr, title_en, description_fr, description_en, level, order
 * - Lessons  : lessonId, courseId, title_fr, title_en, contentHtml_fr, contentHtml_en, videoUrl, filesUrl, order
 * - Quizzes  : quizId, lessonId, title_fr, title_en, passingScore
 * - Questions: questionId, quizId,
 *              question_fr, question_en,
 *              choices_fr, choices_en,   (JSON array OR "A|B|C|D")
 *              correctIndex,             (0-based)
 *              explanation_fr, explanation_en
 *
 * Deploy as Web App (Execute as Me, Access Anyone).
 * Use JSONP by adding ?callback=xxx (front does this automatically if CORS blocks).
 */

const SPREADSHEET_ID = "1wdRFM2Y5-VBeDOwQbBh76IXvBjGNJ48Owi3j8v552xU";


function normalizeSpreadsheetId_(input){
  if (!input) return '';
  input = String(input).trim();
  const m = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m && m[1]) return m[1];
  return input;
}

function getSpreadsheet_(params){
  const raw = String((params && params.spreadsheetId) ? params.spreadsheetId : SPREADSHEET_ID).trim();
  const id = normalizeSpreadsheetId_(raw);
  if (!id || id === 'PASTE_SPREADSHEET_ID_HERE') throw new Error('SPREADSHEET_ID is not set. Please set it or pass ?spreadsheetId=...');
  try {
    return SpreadsheetApp.openById(id);
  } catch (e){
    // fallback if a URL was provided
    try {
      if (String(raw).indexOf('docs.google.com/spreadsheets') !== -1){
        return SpreadsheetApp.openByUrl(String(raw));
      }
    } catch (_) {}
    throw new Error('Cannot open spreadsheet. Check Spreadsheet ID and permissions. Details: ' + e);
  }
}


let params_ = {};

function doGet(e) {
  const params = (e && e.parameter) ? e.parameter : {};
  params_ = params;
  const action = String(params.action || '').trim();
  const callback = params.callback;

  let payload;
  try {
    payload = route_(action, params);
  } catch (err) {
    payload = { error: String(err && err.message ? err.message : err) };
  }

  return output_(payload, callback);
}

// OPTIONAL: for submissions/progress later
function doPost(e) {
  const body = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
  const data = JSON.parse(body || '{}');
  const action = String(data.action || '').trim();
  let payload;
  try {
    payload = route_(action, data);
  } catch (err) {
    payload = { error: String(err && err.message ? err.message : err) };
  }
  return output_(payload, data.callback);
}

function route_(action, params) {
  switch (action) {
    case 'courses':
      return { courses: getAll_('Courses') };

    case 'course': {
      const courseId = String(params.courseId || '');
      const courses = getAll_('Courses');
      const course = courses.find(c => String(c.courseId) === courseId) || null;
      return { course: course };
    }

    case 'lessons': {
      const courseId = String(params.courseId || '');
      const lessons = getAll_('Lessons').filter(l => String(l.courseId) === courseId);
      return { lessons: lessons };
    }

    case 'lesson': {
      const lessonId = String(params.lessonId || '');
      const lessons = getAll_('Lessons');
      const lesson = lessons.find(l => String(l.lessonId) === lessonId) || null;
      return { lesson: lesson };
    }

    case 'health':
      return health_(params);

    case 'quiz': {
      const lessonId = String(params.lessonId || '');
      const quizzes = getAll_('Quizzes');
      const quiz = quizzes.find(q => String(q.lessonId) === lessonId) || null;
      if (!quiz) return { quiz: null };

      const questionsRows = getAll_('Questions').filter(x => String(x.quizId) === String(quiz.quizId));
      const questions = questionsRows.map(q => {
        const choicesFr = parseChoices_(q.choices_fr);
        const choicesEn = parseChoices_(q.choices_en);
        const correctIndex = toInt_(q.correctIndex, -1);

        return {
          questionId: String(q.questionId || ''),
          question_fr: String(q.question_fr || ''),
          question_en: String(q.question_en || ''),
          choices_fr: choicesFr,
          choices_en: choicesEn,
          correctIndex: correctIndex,
          explanation_fr: String(q.explanation_fr || ''),
          explanation_en: String(q.explanation_en || '')
        };
      });

      // normalize passingScore
      quiz.passingScore = toInt_(quiz.passingScore, 0);
      quiz.questions = questions;

      return { quiz: quiz };
    }

    default:
      return {
        ok: true,
        message: 'API is running. Use ?action=courses, course, lessons, lesson, quiz'
      };
  }
}

function getAll_(sheetName) {
  const ss = getSpreadsheet_(params_);
  const sh = ss.getSheetByName(sheetName);
  if (!sh) throw new Error('Missing sheet: ' + sheetName);

  const values = sh.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0].map(h => String(h).trim());
  const rows = values.slice(1);

  return rows
    .filter(r => r.some(cell => String(cell).trim() !== ''))
    .map(r => rowToObj_(headers, r));
}

function rowToObj_(headers, row) {
  const obj = {};
  for (let i = 0; i < headers.length; i++) {
    const key = headers[i];
    if (!key) continue;
    obj[key] = row[i];
  }
  return obj;
}

function parseChoices_(val) {
  if (val === null || val === undefined) return [];
  const s = String(val).trim();
  if (!s) return [];
  // JSON array
  if (s.startsWith('[')) {
    try {
      const arr = JSON.parse(s);
      return Array.isArray(arr) ? arr.map(x => String(x)) : [];
    } catch (e) {
      // fallback to splitter
    }
  }
  // Pipe separated
  if (s.includes('|')) {
    return s.split('|').map(x => String(x).trim()).filter(Boolean);
  }
  // Comma separated fallback
  return s.split(',').map(x => String(x).trim()).filter(Boolean);
}


function parseResources_(raw){
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  const s = String(raw).trim();
  if (!s) return [];
  // JSON array support
  if (s[0] === '['){
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed;
    } catch (e){
      return { __parseError: true, error: String(e) };
    }
  }
  // Pipe support: Label::URL|Label::URL
  return s.split('|').map(x => String(x||'').trim()).filter(Boolean).map(x => {
    const idx = x.indexOf('::');
    if (idx > -1){
      return { label: x.slice(0, idx).trim(), url: x.slice(idx+2).trim() };
    }
    return { label: x, url: x };
  });
}

function isHttp_(url){
  return /^https?:\/\//i.test(String(url||'').trim());
}

function videoType_(url){
  const u = String(url||'').trim();
  if (!u) return '';
  if (/youtu\.be\//i.test(u) || /youtube\.com\/watch\?v=/i.test(u) || /youtube\.com\/embed\//i.test(u)) return 'youtube';
  if (/vimeo\.com\//i.test(u)) return 'vimeo';
  if (/drive\.google\.com\//i.test(u)) return 'gdrive';
  if (/\.mp4(\?|$)/i.test(u)) return 'mp4';
  return 'link';
}

function hasDangerousHtml_(html){
  const s = String(html||'');
  if (/<\s*script\b/i.test(s)) return true;
  if (/on[a-z]+\s*=\s*["']/i.test(s)) return true;
  if (/javascript:\s*/i.test(s)) return true;
  return false;
}

function toInt_(val, fallback) {
  const n = parseInt(String(val), 10);
  return isNaN(n) ? fallback : n;
}

function output_(payload, callback) {
  const json = JSON.stringify(payload);

  // JSONP support (recommended for GitHub Pages to avoid CORS issues)
  if (callback && String(callback).trim() !== '') {
    const cb = String(callback).replace(/[^a-zA-Z0-9_\.]/g, '');
    return ContentService
      .createTextOutput(`${cb}(${json});`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}



function getHeaders_(sheet){
  const values = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues();
  const headers = (values && values[0]) ? values[0].map(String).map(s => s.trim()).filter(Boolean) : [];
  return headers;
}

function health_(params){
  const ss = getSpreadsheet_(params);

  const required = {
    Courses: ['courseId','title_fr','title_en','description_fr','description_en','level','order'],
    Lessons: ['lessonId','courseId','title_fr','title_en','contentHtml_fr','contentHtml_en','videoUrl','filesUrl','order'],
    Quizzes: ['quizId','lessonId','title_fr','title_en','passingScore'],
    Questions: ['questionId','quizId','question_fr','question_en','choices_fr','choices_en','correctIndex','explanation_fr','explanation_en']
  };

  const result = {
    ok: true,
    sheets: {},
    counts: {},
    checks: [],
    summaryNotes: []
  };

  // Sheets + headers
  Object.keys(required).forEach(name => {
    const sh = ss.getSheetByName(name);
    if (!sh){
      result.ok = false;
      result.sheets[name] = { exists: false, missingHeaders: required[name] };
      result.checks.push({ level: 'err', code: 'MISSING_SHEET', message: 'Missing sheet: ' + name });
      return;
    }
    const headers = getHeaders_(sh);
    const missing = required[name].filter(h => headers.indexOf(h) === -1);
    const exists = true;
    result.sheets[name] = { exists: exists, headers: headers, missingHeaders: missing };
    if (missing.length){
      result.ok = false;
      result.checks.push({ level: 'err', code: 'MISSING_HEADERS', message: 'Missing headers in ' + name + ': ' + missing.join(', ') });
    }
  });

  // If critical missing, stop deeper checks
  const hasCritical = result.checks.some(c => c.level === 'err');
  if (hasCritical){

  // Media/HTML/Resources checks (Lessons) [LESSON_MEDIA_RES_CHECKS]
  const lessonsHeaders = result.sheets['Lessons'] && result.sheets['Lessons'].headers ? result.sheets['Lessons'].headers : [];
  const hasResFr = lessonsHeaders.indexOf('resources_fr') !== -1;
  const hasResEn = lessonsHeaders.indexOf('resources_en') !== -1;

  let lessonsWithVideo = 0;
  let lessonsWithResources = 0;
  let resourceIssues = 0;

  lessons.forEach(l => {
    const lid = String(l.lessonId || '');
    // Dangerous HTML
    if (hasDangerousHtml_(l.contentHtml_fr) || hasDangerousHtml_(l.contentHtml_en)){
      result.ok = false;
      result.checks.push({ level: 'err', code: 'DANGEROUS_HTML', message: 'Lesson ' + lid + ': dangerous HTML detected (<script/on*/javascript:)' });
    }

    // Video URL checks
    const v = String(l.videoUrl || '').trim();
    if (v){
      lessonsWithVideo++;
      if (!isHttp_(v)){
        result.checks.push({ level: 'warn', code: 'VIDEO_URL_NOT_HTTP', message: 'Lesson ' + lid + ': videoUrl is not http(s)' });
      } else {
        const vt = videoType_(v);
        if (vt === 'link'){
          result.checks.push({ level: 'warn', code: 'VIDEO_URL_FALLBACK', message: 'Lesson ' + lid + ': videoUrl not recognized for embed (will fallback to open link)' });
        }
      }
    }

    // Resources checks (optional headers)
    const rFr = hasResFr ? l.resources_fr : '';
    const rEn = hasResEn ? l.resources_en : '';
    const parsedFr = parseResources_(rFr);
    const parsedEn = parseResources_(rEn);

    if ((rFr && parsedFr && parsedFr.__parseError) || (rEn && parsedEn && parsedEn.__parseError)){
      result.checks.push({ level: 'warn', code: 'RESOURCES_BAD_JSON', message: 'Lesson ' + lid + ': resources JSON parse error' });
      resourceIssues++;
      return;
    }

    const list = []
      .concat(Array.isArray(parsedFr) ? parsedFr : [])
      .concat(Array.isArray(parsedEn) ? parsedEn : []);

    if (String(l.filesUrl||'').trim()){
      list.push({ label: 'Files', url: String(l.filesUrl).trim() });
    }

    if (list.length){
      lessonsWithResources++;
      const seen = {};
      list.forEach(r => {
        const url = String(r.url || '').trim();
        const label = String(r.label || '').trim();
        if (!url){
          result.ok = false;
          result.checks.push({ level: 'err', code: 'RESOURCE_MISSING_URL', message: 'Lesson ' + lid + ': resource missing URL' });
          resourceIssues++;
          return;
        }
        if (!isHttp_(url)){
          result.checks.push({ level: 'warn', code: 'RESOURCE_URL_NOT_HTTP', message: 'Lesson ' + lid + ': resource URL not http(s) -> ' + url });
          resourceIssues++;
        }
        if (!label){
          result.checks.push({ level: 'warn', code: 'RESOURCE_MISSING_LABEL', message: 'Lesson ' + lid + ': resource missing label for ' + url });
          resourceIssues++;
        }
        if (seen[url]){
          result.checks.push({ level: 'warn', code: 'RESOURCE_DUP_URL', message: 'Lesson ' + lid + ': duplicate resource URL -> ' + url });
          resourceIssues++;
        }
        seen[url] = true;
      });
    }
  });

  // Add counts
  result.counts.lessonsWithVideo = lessonsWithVideo;
  result.counts.lessonsWithResources = lessonsWithResources;
  result.counts.resourceIssues = resourceIssues;

  result.summaryNotes.push(result.ok ? 'All core checks passed.' : 'Some checks failed.');
    return result;
  }

  const courses = getAll_('Courses');
  const lessons = getAll_('Lessons');
  const quizzes = getAll_('Quizzes');
  const questions = getAll_('Questions');

  result.counts = {
    courses: courses.length,
    lessons: lessons.length,
    quizzes: quizzes.length,
    questions: questions.length
  };

  // Unique IDs
  function checkUnique(list, key, code){
    const seen = {};
    const dups = [];
    list.forEach(x => {
      const v = String(x[key] || '').trim();
      if (!v) return;
      if (seen[v]) dups.push(v);
      seen[v] = true;
    });
    if (dups.length){
      result.ok = false;
      result.checks.push({ level: 'err', code: code, message: 'Duplicate ' + key + ': ' + Array.from(new Set(dups)).slice(0,20).join(', ') });
    }
  }
  checkUnique(courses, 'courseId', 'DUP_COURSE_ID');
  checkUnique(lessons, 'lessonId', 'DUP_LESSON_ID');
  checkUnique(quizzes, 'quizId', 'DUP_QUIZ_ID');
  checkUnique(questions, 'questionId', 'DUP_QUESTION_ID');

  // Referential integrity
  const courseIds = {};
  courses.forEach(c => courseIds[String(c.courseId)] = true);
  const lessonIds = {};
  lessons.forEach(l => lessonIds[String(l.lessonId)] = true);
  const quizIds = {};
  quizzes.forEach(q => quizIds[String(q.quizId)] = true);

  const lessonsBad = lessons.filter(l => !courseIds[String(l.courseId)]);
  if (lessonsBad.length){
    result.ok = false;
    result.checks.push({ level: 'err', code: 'LESSON_BAD_COURSE', message: 'Lessons with unknown courseId: ' + lessonsBad.slice(0,20).map(x=>String(x.lessonId)).join(', ') });
  }

  const quizzesBad = quizzes.filter(q => !lessonIds[String(q.lessonId)]);
  if (quizzesBad.length){
    result.ok = false;
    result.checks.push({ level: 'err', code: 'QUIZ_BAD_LESSON', message: 'Quizzes with unknown lessonId: ' + quizzesBad.slice(0,20).map(x=>String(x.quizId)).join(', ') });
  }

  const questionsBad = questions.filter(q => !quizIds[String(q.quizId)]);
  if (questionsBad.length){
    result.ok = false;
    result.checks.push({ level: 'err', code: 'QUESTION_BAD_QUIZ', message: 'Questions with unknown quizId: ' + questionsBad.slice(0,20).map(x=>String(x.questionId)).join(', ') });
  }

  // Quiz correctness checks
  const badCorrectIndex = [];
  questions.forEach(q => {
    const ci = toInt_(q.correctIndex, -999);
    const choicesFr = parseChoices_(q.choices_fr);
    const choicesEn = parseChoices_(q.choices_en);
    const maxLen = Math.max((choicesFr||[]).length, (choicesEn||[]).length);
    if (maxLen <= 0) {
      badCorrectIndex.push(String(q.questionId||'') + ' (no choices)');
      return;
    }
    if (ci < 0 || ci >= maxLen){
      badCorrectIndex.push(String(q.questionId||'') + ' (correctIndex=' + ci + ', choices=' + maxLen + ')');
    }
  });
  if (badCorrectIndex.length){
    result.ok = false;
    result.checks.push({ level: 'err', code: 'BAD_CORRECT_INDEX', message: 'Questions with invalid correctIndex: ' + badCorrectIndex.slice(0,20).join(', ') });
  }

  // Soft warnings
  const missingBilingual = [];
  lessons.forEach(l => {
    if (!l.title_fr || !l.title_en) missingBilingual.push(String(l.lessonId));
  });
  if (missingBilingual.length){
    result.checks.push({ level: 'warn', code: 'MISSING_BILINGUAL', message: 'Some lessons missing FR/EN title: ' + missingBilingual.slice(0,20).join(', ') });
  }

  result.summaryNotes.push(result.ok ? 'All core checks passed.' : 'Some checks failed.');
  return result;
}
