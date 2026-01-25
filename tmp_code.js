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
    case 'platformSettings':
      return platformSettings_(params);

    case 'domains':
      return { domains: safeGetAll_('Domains') };

    case 'modules': {
      const domainId = String(params.domainId || '');
      const modules = safeGetAll_('Modules');
      const filtered = domainId ? modules.filter(m => String(m.domainId) === domainId) : modules;
      return { modules: filtered };
    }

    case 'courses': {
      let courses = safeGetAll_('Courses');
      const moduleId = String(params.moduleId || '');
      const domainId = String(params.domainId || '');
      if (moduleId) {
        courses = courses.filter(c => String(c.moduleId || '') === moduleId);
      } else if (domainId) {
        // Filter by domain via modules mapping (preferred), fallback to course.domainId if present
        const modules = safeGetAll_('Modules').filter(m => String(m.domainId) === domainId);
        const moduleIds = new Set(modules.map(m => String(m.moduleId)));
        courses = courses.filter(c => moduleIds.has(String(c.moduleId || '')) || String(c.domainId || '') === domainId);
      }
      return { courses: courses };
    }

    case 'course': {
      const courseId = String(params.courseId || '');
      const courses = safeGetAll_('Courses');
      const course = courses.find(c => String(c.courseId) === courseId) || null;
      return { course: course };
    }

    case 'lessons': {
      const courseId = String(params.courseId || '');
      const lessons = safeGetAll_('Lessons').filter(l => String(l.courseId) === courseId);
      return { lessons: lessons };
    }

    case 'lesson': {
      const lessonId = String(params.lessonId || '');
      const lessons = safeGetAll_('Lessons');
      const lesson = lessons.find(l => String(l.lessonId) === lessonId) || null;
      return { lesson: lesson };
    }

    case 'quiz': {
      const lessonId = String(params.lessonId || '');
      const quizzes = safeGetAll_('Quizzes').filter(q => String(q.lessonId) === lessonId);
      const quiz = quizzes[0] || null;
      if (!quiz) return { quiz: null, questions: [] };

      const questions = safeGetAll_('Questions')
        .filter(q => String(q.quizId) === String(quiz.quizId))
        .map(q => {
          q.choices = parseChoices_(q);
          return q;
        });

      return { quiz: quiz, questions: questions };
    }

    case 'search':
      return search_(params);

    case 'health':
      return health_(params);

    case 'upsert':
      return upsert_(params);

    case 'delete':
      return delete_(params);

    // AI is served by a separate Apps Script proxy
    case 'aiChat':
      return { error: 'AI_PROXY_REQUIRED', message: 'AI is served by a separate Apps Script proxy. Set AI_API_BASE_URL in app/js/app-config.js to your AI proxy /exec URL.' };

    default:
      return { error: 'Unknown action: ' + action };
  }
}

// -------------------- Global search --------------------
function search_(params){
  const qRaw = String(params.q || params.query || '').trim();
  const q = qRaw.toLowerCase();
  const limit = Math.max(1, Math.min(50, parseInt(params.limit || '20', 10) || 20));
  if (!q || q.length < 2){
    return { domains: [], modules: [], courses: [], lessons: [] };
  }

  // Load all once for performance
  const domains = safeGetAll_('Domains');
  const modules = safeGetAll_('Modules');
  const courses = safeGetAll_('Courses');
  const lessons = safeGetAll_('Lessons');

  const domainById = {};
  domains.forEach(d => { domainById[String(d.domainId)] = d; });
  const moduleById = {};
  modules.forEach(m => { moduleById[String(m.moduleId)] = m; });
  const courseById = {};
  courses.forEach(c => { courseById[String(c.courseId)] = c; });

  function anyFieldMatch_(obj, keys){
    for (let i=0;i<keys.length;i++){
      const v = obj[keys[i]];
      if (v == null) continue;
      const s = String(v).toLowerCase();
      if (s && s.indexOf(q) !== -1) return true;
    }
    return false;
  }

  // Domains
  const domainMatches = domains
    .filter(d => anyFieldMatch_(d, ['domainId','name_fr','name_en','name_ar','description_fr','description_en','description_ar']))
    .slice(0, limit)
    .map(d => d);

  // Modules (enrich with domainName)
  const moduleMatches = modules
    .filter(m => anyFieldMatch_(m, ['moduleId','domainId','title_fr','title_en','title_ar','description_fr','description_en','description_ar']))
    .slice(0, limit)
    .map(m => {
      const d = domainById[String(m.domainId)] || {};
      return Object.assign({}, m, {
        domainName_fr: d.name_fr || '',
        domainName_en: d.name_en || '',
        domainName_ar: d.name_ar || '',
        domainName: d.name_fr || d.name_en || d.name_ar || ''
      });
    });

  // Courses (enrich with moduleTitle + domainId/name)
  const courseMatches = courses
    .filter(c => anyFieldMatch_(c, ['courseId','moduleId','domainId','title_fr','title_en','title_ar','description_fr','description_en','description_ar']))
    .slice(0, limit)
    .map(c => {
      const m = moduleById[String(c.moduleId)] || {};
      const d = domainById[String(m.domainId || c.domainId)] || {};
      return Object.assign({}, c, {
        domainId: String(m.domainId || c.domainId || ''),
        moduleTitle_fr: m.title_fr || '',
        moduleTitle_en: m.title_en || '',
        moduleTitle_ar: m.title_ar || '',
        moduleTitle: m.title_fr || m.title_en || m.title_ar || '',
        domainName_fr: d.name_fr || '',
        domainName_en: d.name_en || '',
        domainName_ar: d.name_ar || '',
        domainName: d.name_fr || d.name_en || d.name_ar || ''
      });
    });

  // Lessons (enrich with courseTitle + module/domain)
  const lessonMatches = lessons
    .filter(l => {
      // Avoid scanning very long HTML; keep it to title + ids + (optional) first 2000 chars
      const okTitle = anyFieldMatch_(l, ['lessonId','courseId','title_fr','title_en','title_ar']);
      if (okTitle) return true;
      const htmlKeys = ['contentHtml_fr','contentHtml_en','contentHtml_ar'];
      for (let i=0;i<htmlKeys.length;i++){
        const v = l[htmlKeys[i]];
        if (!v) continue;
        const s = String(v).slice(0, 2000).toLowerCase();
        if (s.indexOf(q) !== -1) return true;
      }
      return false;
    })
    .slice(0, limit)
    .map(l => {
      const c = courseById[String(l.courseId)] || {};
      const m = moduleById[String(c.moduleId)] || {};
      const d = domainById[String(m.domainId || c.domainId)] || {};
      return Object.assign({}, l, {
        courseTitle_fr: c.title_fr || '',
        courseTitle_en: c.title_en || '',
        courseTitle_ar: c.title_ar || '',
        courseTitle: c.title_fr || c.title_en || c.title_ar || '',
        moduleId: String(m.moduleId || c.moduleId || ''),
        domainId: String(m.domainId || c.domainId || ''),
        moduleTitle_fr: m.title_fr || '',
        moduleTitle_en: m.title_en || '',
        moduleTitle_ar: m.title_ar || '',
        moduleTitle: m.title_fr || m.title_en || m.title_ar || '',
        domainName_fr: d.name_fr || '',
        domainName_en: d.name_en || '',
        domainName_ar: d.name_ar || '',
        domainName: d.name_fr || d.name_en || d.name_ar || ''
      });
    });

  return {
    q: qRaw,
    domains: domainMatches,
    modules: moduleMatches,
    courses: courseMatches,
    lessons: lessonMatches
  };
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


function safeGetAll_(sheetName) {
  try {
    return getAll_(sheetName);
  } catch (e) {
    // Missing sheet -> return empty
    return [];
  }
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





// ---------------- Authoring (Domains/Modules/Courses) ----------------
function sheetMeta_(entity){
  const e = String(entity||'').trim();
  if (e === 'Domains') return { sheet: 'Domains', idKey: 'domainId' };
  if (e === 'Modules') return { sheet: 'Modules', idKey: 'moduleId' };
  if (e === 'Courses') return { sheet: 'Courses', idKey: 'courseId' };
  throw new Error('Unsupported entity: ' + e);
}

function upsert_(params){
  const meta = sheetMeta_(params.entity);
  const ss = getSpreadsheet_(params);
  const sh = ss.getSheetByName(meta.sheet);
  if (!sh) throw new Error('Missing sheet: ' + meta.sheet);

  const headers = getHeaders_(sh);
  const idCol = headers.indexOf(meta.idKey) + 1;
  if (idCol <= 0) throw new Error('Missing header: ' + meta.idKey + ' in ' + meta.sheet);

  const raw = params.data;
  if (!raw) throw new Error('Missing data');
  let obj;
  try { obj = JSON.parse(String(raw)); }
  catch(e){ throw new Error('Invalid JSON data'); }

  const idVal = String(obj[meta.idKey] || '').trim();
  if (!idVal) throw new Error('Missing ' + meta.idKey);

  // Load current rows (keep header row)
  const values = sh.getDataRange().getValues();
  let rowIndex = -1; // 1-based
  for (let r = 2; r <= values.length; r++){
    const cell = values[r-1][idCol-1];
    if (String(cell||'').trim() === idVal){
      rowIndex = r;
      break;
    }
  }

  const setCell = (r, key, value) => {
    const c = headers.indexOf(key) + 1;
    if (c <= 0) return; // ignore unknown fields
    sh.getRange(r, c).setValue(value);
  };

  if (rowIndex === -1){
    // Insert
    const newRow = headers.map(h => {
      const v = obj[h];
      return (v === undefined || v === null) ? '' : v;
    });
    sh.appendRow(newRow);
    return { ok: true, entity: meta.sheet, mode: 'insert', id: idVal };
  }

  // Update only provided keys
  Object.keys(obj).forEach(k => setCell(rowIndex, k, obj[k]));
  return { ok: true, entity: meta.sheet, mode: 'update', id: idVal };
}

function delete_(params){
  const meta = sheetMeta_(params.entity);
  const ss = getSpreadsheet_(params);
  const sh = ss.getSheetByName(meta.sheet);
  if (!sh) throw new Error('Missing sheet: ' + meta.sheet);

  const headers = getHeaders_(sh);
  const idCol = headers.indexOf(meta.idKey) + 1;
  if (idCol <= 0) throw new Error('Missing header: ' + meta.idKey + ' in ' + meta.sheet);

  const idVal = String(params.id || '').trim();
  if (!idVal) throw new Error('Missing id');

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return { ok: true, entity: meta.sheet, mode: 'noop', id: idVal };

  const colVals = sh.getRange(2, idCol, lastRow-1, 1).getValues();
  for (let i = 0; i < colVals.length; i++){
    if (String(colVals[i][0]||'').trim() === idVal){
      sh.deleteRow(i + 2);
      return { ok: true, entity: meta.sheet, mode: 'delete', id: idVal };
    }
  }
  return { ok: true, entity: meta.sheet, mode: 'not_found', id: idVal };
}

function getHeaders_(sheet){
  const values = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues();
  const headers = (values && values[0]) ? values[0].map(String).map(s => s.trim()).filter(Boolean) : [];
  return headers;
}

function health_(params){
  const ss = getSpreadsheet_(params);

  const required = {
    Domains: ['domainId','name_fr','name_en','description_fr','description_en','order'],
    Modules: ['moduleId','domainId','title_fr','title_en','description_fr','description_en','order'],
    Courses: ['courseId','moduleId','title_fr','title_en','description_fr','description_en','level','order'],
    Lessons: ['lessonId','courseId','title_fr','title_en','contentHtml_fr','contentHtml_en','videoUrl','filesUrl','order'],
    Quizzes: ['quizId','lessonId','title_fr','title_en','passingScore'],
    Questions: ['questionId','quizId','question_fr','question_en','choices_fr','choices_en','correctIndex','explanation_fr','explanation_en']
  };

  // optional columns we can use for richer features
  const optional = {
    Domains: ['name_ar','description_ar','icon','isActive'],
    Modules: ['title_ar','description_ar','icon','isActive'],
    Courses: ['title_ar','description_ar','isActive'],
    Lessons: ['title_ar','contentHtml_ar','resources_fr','resources_en','resources_ar'],
    Quizzes: ['title_ar'],
    Questions: ['question_ar','choices_ar','explanation_ar']
  };

  const result = {
    ok: true,
    sheets: {},
    counts: {},
    checks: [],
    summaryNotes: []
  };

  // --- Sheet existence + header checks
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
    const warnMissing = (optional[name] || []).filter(h => headers.indexOf(h) === -1);
    result.sheets[name] = { exists: true, headers: headers, missingHeaders: missing, missingOptionalHeaders: warnMissing };
    if (missing.length){
      result.ok = false;
      result.checks.push({ level: 'err', code: 'MISSING_HEADERS', message: 'Missing headers in ' + name + ': ' + missing.join(', ') });
    } else if (warnMissing.length){
      result.checks.push({ level: 'warn', code: 'MISSING_OPTIONAL_HEADERS', message: 'Optional headers missing in ' + name + ': ' + warnMissing.join(', ') });
    }
  });

  // --- Load data defensively (empty if sheet/headers missing)
  function canLoad_(name){
    return result.sheets[name] && result.sheets[name].exists && (!result.sheets[name].missingHeaders || !result.sheets[name].missingHeaders.length);
  }

  const domains = canLoad_('Domains') ? safeGetAll_('Domains') : [];
  const modules = canLoad_('Modules') ? safeGetAll_('Modules') : [];
  const courses = canLoad_('Courses') ? safeGetAll_('Courses') : [];
  const lessons = canLoad_('Lessons') ? safeGetAll_('Lessons') : [];
  const quizzes = canLoad_('Quizzes') ? safeGetAll_('Quizzes') : [];
  const questions = canLoad_('Questions') ? safeGetAll_('Questions') : [];

  result.counts = {
    domains: domains.length,
    modules: modules.length,
    courses: courses.length,
    lessons: lessons.length,
    quizzes: quizzes.length,
    questions: questions.length
  };

  // --- Uniqueness checks
  function checkUnique(list, key, code){
    const seen = {};
    const dups = {};
    list.forEach(x => {
      const v = String(x[key] || '').trim();
      if (!v) return;
      if (seen[v]) dups[v] = true;
      seen[v] = true;
    });
    const dupKeys = Object.keys(dups);
    if (dupKeys.length){
      result.ok = false;
      result.checks.push({ level: 'err', code: code, message: 'Duplicate ' + key + ': ' + dupKeys.slice(0,20).join(', ') });
    }
  }
  checkUnique(domains, 'domainId', 'DUP_DOMAIN_ID');
  checkUnique(modules, 'moduleId', 'DUP_MODULE_ID');
  checkUnique(courses, 'courseId', 'DUP_COURSE_ID');
  checkUnique(lessons, 'lessonId', 'DUP_LESSON_ID');
  checkUnique(quizzes, 'quizId', 'DUP_QUIZ_ID');
  checkUnique(questions, 'questionId', 'DUP_QUESTION_ID');

  // --- Referential integrity
  const domainIds = {};
  domains.forEach(d => domainIds[String(d.domainId)] = true);

  const moduleIds = {};
  modules.forEach(m => moduleIds[String(m.moduleId)] = true);

  const courseIds = {};
  courses.forEach(c => courseIds[String(c.courseId)] = true);

  const lessonIds = {};
  lessons.forEach(l => lessonIds[String(l.lessonId)] = true);

  const quizIds = {};
  quizzes.forEach(q => quizIds[String(q.quizId)] = true);

  const badModules = modules.filter(m => !domainIds[String(m.domainId)]);
  if (badModules.length){
    result.ok = false;
    result.checks.push({ level: 'err', code: 'MODULE_BAD_DOMAIN', message: 'Modules with unknown domainId: ' + badModules.slice(0,20).map(x=>String(x.moduleId)).join(', ') });
  }

  const badCourses = courses.filter(c => !moduleIds[String(c.moduleId)]);
  if (badCourses.length){
    result.ok = false;
    result.checks.push({ level: 'err', code: 'COURSE_BAD_MODULE', message: 'Courses with unknown moduleId: ' + badCourses.slice(0,20).map(x=>String(x.courseId)).join(', ') });
  }

  const badLessons = lessons.filter(l => !courseIds[String(l.courseId)]);
  if (badLessons.length){
    result.ok = false;
    result.checks.push({ level: 'err', code: 'LESSON_BAD_COURSE', message: 'Lessons with unknown courseId: ' + badLessons.slice(0,20).map(x=>String(x.lessonId)).join(', ') });
  }

  const badQuizzes = quizzes.filter(q => !lessonIds[String(q.lessonId)]);
  if (badQuizzes.length){
    result.ok = false;
    result.checks.push({ level: 'err', code: 'QUIZ_BAD_LESSON', message: 'Quizzes with unknown lessonId: ' + badQuizzes.slice(0,20).map(x=>String(x.quizId)).join(', ') });
  }

  const badQuestions = questions.filter(q => !quizIds[String(q.quizId)]);
  if (badQuestions.length){
    result.ok = false;
    result.checks.push({ level: 'err', code: 'QUESTION_BAD_QUIZ', message: 'Questions with unknown quizId: ' + badQuestions.slice(0,20).map(x=>String(x.questionId)).join(', ') });
  }

  // --- Question correctness (correctIndex within choices length)
  const badCorrectIndex = [];
  questions.forEach(q => {
    const ci = toInt_(q.correctIndex, -999);
    const choicesFr = parseChoices_(q.choices_fr);
    const choicesEn = parseChoices_(q.choices_en);
    const choicesAr = parseChoices_(q.choices_ar);
    const maxLen = Math.max((choicesFr||[]).length, (choicesEn||[]).length, (choicesAr||[]).length);
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

  // --- Lessons: HTML + Video + Resources checks
  const lessonsHeaders = (result.sheets['Lessons'] && result.sheets['Lessons'].headers) ? result.sheets['Lessons'].headers : [];
  const hasResFr = lessonsHeaders.indexOf('resources_fr') !== -1;
  const hasResEn = lessonsHeaders.indexOf('resources_en') !== -1;
  const hasResAr = lessonsHeaders.indexOf('resources_ar') !== -1;

  let lessonsWithVideo = 0;
  let lessonsWithResources = 0;
  let resourceIssues = 0;

  lessons.forEach(l => {
    const lid = String(l.lessonId || '');

    // Dangerous HTML
    if (hasDangerousHtml_(l.contentHtml_fr) || hasDangerousHtml_(l.contentHtml_en) || hasDangerousHtml_(l.contentHtml_ar)){
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
    const rAr = hasResAr ? l.resources_ar : '';

    const parsedFr = parseResources_(rFr);
    const parsedEn = parseResources_(rEn);
    const parsedAr = parseResources_(rAr);

    if ((rFr && parsedFr && parsedFr.__parseError) || (rEn && parsedEn && parsedEn.__parseError) || (rAr && parsedAr && parsedAr.__parseError)){
      result.checks.push({ level: 'warn', code: 'RESOURCES_BAD_JSON', message: 'Lesson ' + lid + ': resources JSON parse error' });
      resourceIssues++;
      return;
    }

    // Validate resources per column (avoid cross-language duplicate warnings)
    const resBuckets = [
      { col: 'resources_fr', items: Array.isArray(parsedFr) ? parsedFr : [] },
      { col: 'resources_en', items: Array.isArray(parsedEn) ? parsedEn : [] },
      { col: 'resources_ar', items: Array.isArray(parsedAr) ? parsedAr : [] }
    ];

    let hasAnyResource = false;

    function validateResItems_(items){
      const seen = {};
      (items || []).forEach(r => {
        hasAnyResource = true;
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
          // Duplicate check only within the same column list
          result.checks.push({ level: 'warn', code: 'RESOURCE_DUP_URL', message: 'Lesson ' + lid + ': duplicate resource URL -> ' + url });
          resourceIssues++;
        }
        seen[url] = true;
      });
    }

    resBuckets.forEach(b => validateResItems_(b.items));

    const filesUrl = String(l.filesUrl||'').trim();
    if (filesUrl){
      hasAnyResource = true;
      if (!isHttp_(filesUrl)){
        result.checks.push({ level: 'warn', code: 'RESOURCE_URL_NOT_HTTP', message: 'Lesson ' + lid + ': resource URL not http(s) -> ' + filesUrl });
        resourceIssues++;
      }
    }

    if (hasAnyResource){
      lessonsWithResources++;
    }
  });

  result.counts.lessonsWithVideo = lessonsWithVideo;
  result.counts.lessonsWithResources = lessonsWithResources;
  result.counts.resourceIssues = resourceIssues;

  // --- Soft bilingual warnings
  const missingDomainNames = domains.filter(d => !d.name_fr || !d.name_en).map(d => String(d.domainId));
  if (missingDomainNames.length){
    result.checks.push({ level: 'warn', code: 'MISSING_DOMAIN_BILINGUAL', message: 'Some domains missing FR/EN name: ' + missingDomainNames.slice(0,20).join(', ') });
  }
  const missingModuleTitles = modules.filter(m => !m.title_fr || !m.title_en).map(m => String(m.moduleId));
  if (missingModuleTitles.length){
    result.checks.push({ level: 'warn', code: 'MISSING_MODULE_BILINGUAL', message: 'Some modules missing FR/EN title: ' + missingModuleTitles.slice(0,20).join(', ') });
  }
  const missingCourseTitles = courses.filter(c => !c.title_fr || !c.title_en).map(c => String(c.courseId));
  if (missingCourseTitles.length){
    result.checks.push({ level: 'warn', code: 'MISSING_COURSE_BILINGUAL', message: 'Some courses missing FR/EN title: ' + missingCourseTitles.slice(0,20).join(', ') });
  }
  const missingLessonTitles = lessons.filter(l => !l.title_fr || !l.title_en).map(l => String(l.lessonId));
  if (missingLessonTitles.length){
    result.checks.push({ level: 'warn', code: 'MISSING_LESSON_BILINGUAL', message: 'Some lessons missing FR/EN title: ' + missingLessonTitles.slice(0,20).join(', ') });
  }

  result.summaryNotes.push(result.ok ? 'All core checks passed.' : 'Some checks failed.');
  return result;
}


// ---------------- AI Assistant ----------------
function aiChat_(params){
  const apiKey = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');
  if (!apiKey) {
    return { error: 'AI_NOT_CONFIGURED' };
  }

  const lessonId = String(params.lessonId || '').trim();
  const lang = String(params.lang || 'fr').trim().toLowerCase();
  const mode = String(params.mode || 'explain').trim().toLowerCase();
  const q = String(params.q || '').trim();

  if (!lessonId) return { error: 'Missing lessonId' };
  if (!q) return { error: 'Missing q' };

  const lessons = getAll_('Lessons');
  const lesson = lessons.find(l => String(l.lessonId) === lessonId) || null;
  if (!lesson) return { error: 'Lesson not found' };

  // Pick FR/EN content (AR UI can still use FR content)
  const content = (lang === 'en')
    ? (lesson.contentHtml_en || lesson.contentHtml_fr || '')
    : (lesson.contentHtml_fr || lesson.contentHtml_en || '');

  const title = (lang === 'en')
    ? (lesson.title_en || lesson.title_fr || lessonId)
    : (lesson.title_fr || lesson.title_en || lessonId);

  const system = [
    "You are a helpful VBA tutor for economics students.",
    "Answer clearly and step-by-step.",
    "If the question is unrelated to the lesson, gently redirect to the lesson topics."
  ].join(" ");

  const modeInstruction = {
    explain: "Explain the concept in simple terms and add a short example if helpful.",
    examples: "Provide 2-4 concrete VBA examples related to the lesson.",
    exercises: "Generate 3 exercises (easy/medium/hard) related to the lesson, with hints (no full solution unless asked).",
    quiz: "Create a mini-quiz of 5 questions with answers at the end.",
    review: "Review the student's approach/code and suggest improvements and fixes."
  }[mode] || "Help the student.";

  // Reduce HTML noise
  const plain = stripHtml_(String(content || '')).slice(0, 6000);

  const user = [
    `Lesson title: ${title}`,
    `Lesson content (summary): ${plain}`,
    `Student request (mode=${mode}): ${q}`,
    modeInstruction
  ].join("\n\n");

  const model = PropertiesService.getScriptProperties().getProperty('OPENAI_MODEL') || 'gpt-4o-mini';

  const payload = {
    model: model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    temperature: 0.4
  };

  const res = UrlFetchApp.fetch("https://api.openai.com/v1/chat/completions", {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + apiKey },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const status = res.getResponseCode();
  const body = res.getContentText();
  if (status < 200 || status >= 300){
    return { error: `OpenAI HTTP ${status}: ${body}` };
  }

  const data = JSON.parse(body || "{}");
  const answer = data && data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : "";
  return { answer: String(answer || '').trim() };
}

function stripHtml_(html){
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}


/** =========================
 *  Platform Settings (optional)
 *  Sheet name: platform_settings
 *  Supported formats:
 *   A) Key/Value table with headers like: key | value | value_fr | value_en | value_ar
 *   B) Single-row table with headers like: app_name, tagline_fr, tagline_en, tagline_ar, footer_fr, footer_en, footer_ar, logo_url, icon_url, primary_color
 *  If sheet is missing, defaults are returned.
 * ========================= */
function platformSettings_(params){
  const defaults = {
    appName: 'LearnHub',
    tagline_fr: 'Apprendre. Pratiquer. Progresser.',
    tagline_en: 'Learn. Practice. Grow.',
    tagline_ar: 'تعلّم. طبّق. تطوّر.',
    footer_fr: '© 2026 LearnHub. Tous droits réservés.',
    footer_en: '© 2026 LearnHub. All rights reserved.',
    footer_ar: '© 2026 LearnHub. جميع الحقوق محفوظة.',
    logoUrl: '',
    iconUrl: '',
    primaryColor: ''
  };

  const ss = getSpreadsheet_(params);
  const sheet = ss.getSheetByName('platform_settings');
  if (!sheet) return { settings: defaults };

  const values = sheet.getDataRange().getValues();
  if (!values || values.length < 2) return { settings: defaults };

  const headers = values[0].map(h => String(h || '').trim().toLowerCase());
  // Detect format B (single row by headers)
  const hasAppName = headers.indexOf('app_name') !== -1 || headers.indexOf('appname') !== -1;
  if (hasAppName){
    const row = values[1];
    const get = (name) => {
      const idx = headers.indexOf(name);
      return idx >= 0 ? String(row[idx] || '').trim() : '';
    };
    const s = {
      appName: get('app_name') || get('appname') || defaults.appName,
      tagline_fr: get('tagline_fr') || defaults.tagline_fr,
      tagline_en: get('tagline_en') || defaults.tagline_en,
      tagline_ar: get('tagline_ar') || defaults.tagline_ar,
      footer_fr: get('footer_fr') || defaults.footer_fr,
      footer_en: get('footer_en') || defaults.footer_en,
      footer_ar: get('footer_ar') || defaults.footer_ar,
      logoUrl: get('logo_url') || get('logourl') || defaults.logoUrl,
      iconUrl: get('icon_url') || get('iconurl') || defaults.iconUrl,
      primaryColor: get('primary_color') || get('primarycolor') || defaults.primaryColor
    };
    return { settings: s };
  }

  // Format A (key/value rows)
  const idxKey = headers.indexOf('key');
  const idxVal = headers.indexOf('value');
  const idxFr = headers.indexOf('value_fr');
  const idxEn = headers.indexOf('value_en');
  const idxAr = headers.indexOf('value_ar');

  const map = {};
  for (let i=1;i<values.length;i++){
    const r = values[i];
    const k = idxKey>=0 ? String(r[idxKey]||'').trim() : '';
    if (!k) continue;
    map[k] = {
      value: idxVal>=0 ? String(r[idxVal]||'').trim() : '',
      fr: idxFr>=0 ? String(r[idxFr]||'').trim() : '',
      en: idxEn>=0 ? String(r[idxEn]||'').trim() : '',
      ar: idxAr>=0 ? String(r[idxAr]||'').trim() : ''
    };
  }

  const s = {
    appName: (map.app_name && (map.app_name.value||map.app_name.fr||map.app_name.en||map.app_name.ar)) || defaults.appName,
    tagline_fr: (map.tagline && (map.tagline.fr || map.tagline.value)) || (map.tagline_fr && (map.tagline_fr.value||map.tagline_fr.fr)) || defaults.tagline_fr,
    tagline_en: (map.tagline && (map.tagline.en || map.tagline.value)) || (map.tagline_en && (map.tagline_en.value||map.tagline_en.en)) || defaults.tagline_en,
    tagline_ar: (map.tagline && (map.tagline.ar || map.tagline.value)) || (map.tagline_ar && (map.tagline_ar.value||map.tagline_ar.ar)) || defaults.tagline_ar,
    footer_fr: (map.footer && (map.footer.fr || map.footer.value)) || (map.footer_fr && (map.footer_fr.value||map.footer_fr.fr)) || defaults.footer_fr,
    footer_en: (map.footer && (map.footer.en || map.footer.value)) || (map.footer_en && (map.footer_en.value||map.footer_en.en)) || defaults.footer_en,
    footer_ar: (map.footer && (map.footer.ar || map.footer.value)) || (map.footer_ar && (map.footer_ar.value||map.footer_ar.ar)) || defaults.footer_ar,
    logoUrl: (map.logo_url && (map.logo_url.value)) || defaults.logoUrl,
    iconUrl: (map.icon_url && (map.icon_url.value)) || defaults.iconUrl,
    primaryColor: (map.primary_color && (map.primary_color.value)) || defaults.primaryColor
  };
  return { settings: s };
}
