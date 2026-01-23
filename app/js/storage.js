const NS = "vbaEco";

function key(k){ return `${NS}:${k}`; }

export function loadJSON(k, fallback=null){
  try {
    const v = localStorage.getItem(key(k));
    if (!v) return fallback;
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

export function saveJSON(k, value){
  localStorage.setItem(key(k), JSON.stringify(value));
}

export function markLessonVisited(lessonId){
  const recent = loadJSON("recentLessons", []);
  const next = [lessonId, ...recent.filter(id => id !== lessonId)].slice(0, 10);
  saveJSON("recentLessons", next);
}

export function setLessonCompleted(lessonId, score=null){
  const progress = loadJSON("progress", {});
  progress[lessonId] = {
    completed: true,
    score: score,
    updatedAt: new Date().toISOString(),
  };
  saveJSON("progress", progress);
}

export function getProgress(){
  return loadJSON("progress", {});
}


export function getLang(fallback='fr'){
  return loadJSON('lang', null) || fallback;
}
export function setLang(lang){
  saveJSON('lang', lang);
}


export function getContentLang(fallback='fr'){
  return loadJSON('contentLang', null) || fallback;
}
export function setContentLang(lang){
  saveJSON('contentLang', lang);
}


export function saveQuizResult(lessonId, result){
  const all = loadJSON('quizResults', {});
  const key = String(lessonId);
  const prev = all[key];

  // keep best score
  if (!prev || (typeof result?.score === 'number' && (typeof prev?.score !== 'number' || result.score >= prev.score))){
    all[key] = result;
  } else {
    // still keep the most recent attempt timestamp if provided
    all[key] = { ...prev, at: result?.at ?? prev?.at };
  }
  saveJSON('quizResults', all);
}


export function getRecentLessons(){
  return loadJSON("recentLessons", []);
}


export function isLessonCompleted(lessonId){
  const progress = loadJSON("progress", {});
  return Boolean(progress[String(lessonId)] && progress[String(lessonId)].completed);
}

export function getCompletedLessons(){
  const progress = loadJSON("progress", {});
  return Object.keys(progress).filter(k => progress[k]?.completed);
}

export function getLastVisitedLesson(){
  const recent = loadJSON("recentLessons", []);
  return recent && recent.length ? recent[0] : null;
}

export function getBestQuizResult(lessonId){
  const all = loadJSON("quizResults", {});
  return all[String(lessonId)] || null;
}


export function getBestQuizScore(lessonId){
  const all = loadJSON("quizResults", {});
  const r = all[String(lessonId)];
  return r && typeof r.score === "number" ? r.score : null;
}

