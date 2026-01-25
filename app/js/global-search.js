import { searchAll } from './api.js';
import { t, pickField } from './i18n.js';
import { escapeHTML } from './ui.js';

let lastQ = '';
let reqId = 0;

function debounce(fn, wait=250){
  let to = null;
  return (...args) => {
    clearTimeout(to);
    to = setTimeout(() => fn(...args), wait);
  };
}

function buildHref(item){
  const type = item.type;
  if (type === 'domain'){
    return `modules.html?domainId=${encodeURIComponent(item.domainId)}`;
  }
  if (type === 'module'){
    return `courses.html?domainId=${encodeURIComponent(item.domainId)}&moduleId=${encodeURIComponent(item.moduleId)}`;
  }
  if (type === 'course'){
    const qs = new URLSearchParams();
    qs.set('courseId', item.courseId);
    if (item.domainId) qs.set('domainId', item.domainId);
    if (item.moduleId) qs.set('moduleId', item.moduleId);
    return `course.html?${qs.toString()}`;
  }
  if (type === 'lesson'){
    const qs = new URLSearchParams();
    qs.set('lessonId', item.lessonId);
    if (item.courseId) qs.set('courseId', item.courseId);
    if (item.domainId) qs.set('domainId', item.domainId);
    if (item.moduleId) qs.set('moduleId', item.moduleId);
    return `lesson.html?${qs.toString()}`;
  }
  return '#';
}

function labelFor(item){
  if (item.type === 'domain'){
    return pickField(item, 'name') || item.name || item.domainId;
  }
  if (item.type === 'module'){
    return pickField(item, 'title') || item.title || item.moduleId;
  }
  if (item.type === 'course'){
    return pickField(item, 'title') || item.title || item.courseId;
  }
  if (item.type === 'lesson'){
    return pickField(item, 'title') || item.title || item.lessonId;
  }
  return '';
}

function subFor(item){
  if (item.type === 'module'){
    const d = item.domainName ? (pickField(item, 'domainName') || item.domainName) : '';
    return d ? d : (item.domainId ? `Domain: ${item.domainId}` : '');
  }
  if (item.type === 'course'){
    const m = item.moduleTitle ? (pickField(item, 'moduleTitle') || item.moduleTitle) : '';
    return m ? m : (item.moduleId ? `Module: ${item.moduleId}` : '');
  }
  if (item.type === 'lesson'){
    const c = item.courseTitle ? (pickField(item, 'courseTitle') || item.courseTitle) : '';
    return c ? c : (item.courseId ? `Course: ${item.courseId}` : '');
  }
  return '';
}

function renderGroup(menu, titleKey, items){
  if (!items || !items.length) return;
  menu.insertAdjacentHTML('beforeend', `<h6 class="dropdown-header">${escapeHTML(t(titleKey))}</h6>`);
  items.forEach(it => {
    const href = buildHref(it);
    const label = labelFor(it);
    const sub = subFor(it);
    const subHtml = sub ? `<span class="lh-search-sub">${escapeHTML(sub)}</span>` : '';
    menu.insertAdjacentHTML('beforeend', `<a class="dropdown-item" href="${href}">${escapeHTML(label)}${subHtml}</a>`);
  });
}

export function initGlobalSearch({ input, menu }){
  if (!input || !menu) return;

  const hide = () => {
    menu.classList.remove('show');
    menu.innerHTML = '';
  };

  const show = () => {
    menu.classList.add('show');
  };

  const doSearch = debounce(async () => {
    const q = (input.value || '').trim();
    if (q.length < 2){
      lastQ = '';
      hide();
      return;
    }
    if (q === lastQ) return;
    lastQ = q;
    const myReq = ++reqId;
    menu.innerHTML = `<div class="dropdown-item disabled">${escapeHTML(t('search.loading'))}</div>`;
    show();
    try{
      const res = await searchAll(q, 24);
      if (myReq !== reqId) return;
      menu.innerHTML = '';
      const any = (res.domains?.length||0) + (res.modules?.length||0) + (res.courses?.length||0) + (res.lessons?.length||0);
      if (!any){
        menu.innerHTML = `<div class="dropdown-item disabled">${escapeHTML(t('search.noResults'))}</div>`;
        show();
        return;
      }
      renderGroup(menu, 'search.domains', (res.domains||[]).map(d => ({...d, type:'domain'})));
      renderGroup(menu, 'search.modules', (res.modules||[]).map(m => ({...m, type:'module'})));
      renderGroup(menu, 'search.courses', (res.courses||[]).map(c => ({...c, type:'course'})));
      renderGroup(menu, 'search.lessons', (res.lessons||[]).map(l => ({...l, type:'lesson'})));
      show();
    } catch(e){
      menu.innerHTML = `<div class="dropdown-item disabled">${escapeHTML(t('search.error'))}</div>`;
      show();
    }
  }, 250);

  input.addEventListener('input', doSearch);
  input.addEventListener('focus', doSearch);

  document.addEventListener('click', (ev) => {
    const within = ev.target === input || menu.contains(ev.target) || input.closest('.lh-search-container')?.contains(ev.target);
    if (!within) hide();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide();
  });
}
