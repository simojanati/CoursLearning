export function qs(sel, root=document){ return root.querySelector(sel); }
export function qsa(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }

export function getParam(name){
  const url = new URL(window.location.href);
  return url.searchParams.get(name);
}

export function setText(el, txt){ if (el) el.textContent = txt ?? ""; }
export function setHTML(el, html){ if (el) el.innerHTML = html ?? ""; }

export function renderEmpty(container, title, desc){
  container.innerHTML = `
    <div class="empty-state text-center">
      <h6 class="mb-2">${escapeHTML(title)}</h6>
      <p class="mb-0 text-muted">${escapeHTML(desc)}</p>
    </div>
  `;
}

export function escapeHTML(str){
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function toast(message, type="primary"){
  // Sneat uses Bootstrap 5; we create a minimal toast in-place.
  let wrap = document.getElementById("appToastWrap");
  if (!wrap){
    wrap = document.createElement("div");
    wrap.id = "appToastWrap";
    wrap.className = "position-fixed bottom-0 end-0 p-3";
    wrap.style.zIndex = "1080";
    document.body.appendChild(wrap);
  }

  const id = `t${Math.random().toString(16).slice(2)}`;
  const el = document.createElement("div");
  el.className = "toast align-items-center text-bg-"+type+" border-0";
  el.id = id;
  el.role = "alert";
  el.ariaLive = "assertive";
  el.ariaAtomic = "true";
  el.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">${escapeHTML(message)}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
    </div>
  `;
  wrap.appendChild(el);

  // Bootstrap toast API
  const t = new bootstrap.Toast(el, { delay: 2600 });
  t.show();
  el.addEventListener('hidden.bs.toast', () => el.remove());
}




// --- Global loader (spinner overlay) ---
let __lhLoadingCount = 0;

function ensureGlobalLoader(){
  let el = document.getElementById('lhGlobalLoader');
  if (el) return el;

  el = document.createElement('div');
  el.id = 'lhGlobalLoader';
  el.className = 'lh-loader d-none';
  el.innerHTML = `
    <div class="card shadow-sm">
      <div class="card-body d-flex align-items-center gap-3">
        <div class="spinner-border" role="status" aria-label="Loading"></div>
        <div>
          <div class="fw-semibold" id="lhLoaderTitle">Loading…</div>
          <div class="small text-muted" id="lhLoaderDesc">Please wait</div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(el);
  return el;
}

export function startLoading(title='Loading…', desc='Please wait'){
  __lhLoadingCount++;
  const el = ensureGlobalLoader();
  const t = document.getElementById('lhLoaderTitle');
  const d = document.getElementById('lhLoaderDesc');
  if (t) t.textContent = title;
  if (d) d.textContent = desc;
  el.classList.remove('d-none');
  document.body.classList.add('lh-loading');
}

export function stopLoading(){
  __lhLoadingCount = Math.max(0, __lhLoadingCount - 1);
  if (__lhLoadingCount !== 0) return;
  const el = document.getElementById('lhGlobalLoader');
  if (el) el.classList.add('d-none');
  document.body.classList.remove('lh-loading');
}

// Listen to API loading events
try {
  window.addEventListener('lh:loading', (e) => {
    const on = !!e?.detail?.on;
    if (on) startLoading(e?.detail?.title || 'Loading…', e?.detail?.desc || 'Please wait');
    else stopLoading();
  });
} catch (e) {}

// --- Menu active state (avoid hardcoded active in HTML) ---
export function activateSidebarMenu(){
  try {
    const current = (location.pathname.split('/').pop() || '').split('?')[0];
    if (!current) return;

    // clear current active
    document.querySelectorAll('.menu-inner .menu-item.active').forEach(li => li.classList.remove('active'));
    document.querySelectorAll('.menu-inner .menu-item.open').forEach(li => li.classList.remove('open'));

    const links = Array.from(document.querySelectorAll('.menu-inner a.menu-link[href]'));
    const exact = links.find(a => (a.getAttribute('href')||'').split('?')[0] === current);
    if (!exact) return;

    const li = exact.closest('.menu-item');
    if (li) li.classList.add('active');

    // If this item is inside a submenu, mark parents as open but not active
    let parent = li ? li.parentElement : null;
    while (parent) {
      const parentItem = parent.closest('.menu-item');
      if (parentItem && parentItem !== li) parentItem.classList.add('open');
      parent = parentItem ? parentItem.parentElement : null;
    }
  } catch (e) {}
}

// Run once on load (every page imports ui.js)
try { activateSidebarMenu(); } catch (e) {}


export function renderBreadcrumbs(items, listSelector='#breadcrumbList', containerSelector='#breadcrumbs'){
  const list = qs(listSelector);
  const container = qs(containerSelector);
  if (!list || !container) return;

  const safe = (s) => escapeHTML(String(s||''));
  list.innerHTML = (items||[]).map((it, idx) => {
    const isLast = idx === (items.length - 1);
    const label = safe(it.label);
    const href = it.href ? String(it.href) : '';
    const active = isLast || it.active;
    if (active || !href){
      return `<li class="breadcrumb-item active" aria-current="page">${label}</li>`;
    }
    return `<li class="breadcrumb-item"><a href="${safe(href)}">${label}</a></li>`;
  }).join('');
  container.style.display = items && items.length ? '' : 'none';
}


// --- Responsive tables: render table rows as cards on small screens ---
// This keeps the desktop/tablet table layout intact, but avoids horizontal scrolling
// on mobile by converting each <tbody><tr> into a block "card".

const __LH_TABLE_CARDS_CLASS = 'lh-table-cards';
const __LH_TABLE_RESP_WRAP_CLASS = 'lh-table-responsive-cards';
let __lhTableCardsObserverStarted = false;
let __lhTableCardsDebounce = null;

function _normalizeHeaderText(txt){
  return String(txt || '').replace(/\s+/g, ' ').trim();
}

function _isActionsHeader(h){
  const t = String(h || '').toLowerCase();
  return /action|actions|operation|operations|op[ée]ration|op[ée]rations|\u0625\u062c\u0631\u0627\u0621\u0627\u062a|\u0627\u062c\u0631\u0627\u0621\u0627\u062a/.test(t);
}

function _extractHeaders(table){
  // Prefer thead th
  const ths = Array.from(table.querySelectorAll('thead th'));
  if (ths.length){
    return ths.map(th => _normalizeHeaderText(th.innerText || th.textContent));
  }

  // Fallback: first row cells (rare)
  const firstRow = table.querySelector('tr');
  if (!firstRow) return [];
  return Array.from(firstRow.children)
    .map(c => _normalizeHeaderText(c.innerText || c.textContent));
}

function _enhanceSingleTable(table){
  if (!table) return;

  // Extract headers each run (header text can change after i18n).
  const headers = _extractHeaders(table);
  if (!headers.length) return;

  // Mark table + wrapper once
  table.classList.add(__LH_TABLE_CARDS_CLASS);
  const wrap = table.closest('.table-responsive');
  if (wrap) wrap.classList.add(__LH_TABLE_RESP_WRAP_CLASS);

  const actionIdx = headers.findIndex(_isActionsHeader);

  // Add data-label to every body cell based on column header.
  // IMPORTANT: tables are rendered dynamically; reruns should label new rows too.
  const rows = Array.from(table.querySelectorAll('tbody tr'));
  for (const tr of rows){
    const cells = Array.from(tr.children).filter(c => c.tagName === 'TD' || c.tagName === 'TH');
    cells.forEach((cell, idx) => {
      cell.setAttribute('data-label', headers[idx] || '');
      if (idx === actionIdx && actionIdx >= 0) cell.classList.add('lh-td-actions');
      else cell.classList.remove('lh-td-actions');
    });
  }
}

export function enhanceTablesAsCards(root=document){
  try {
    const tables = Array.from(root.querySelectorAll('table'))
      .filter(t => !t.classList.contains('lh-no-cards'));
    tables.forEach(_enhanceSingleTable);
  } catch (e) {}
}

function _startTableCardsObserver(){
  if (__lhTableCardsObserverStarted) return;
  __lhTableCardsObserverStarted = true;

  // Initial run
  enhanceTablesAsCards(document);

  // Observe DOM changes (tables are often rendered dynamically)
  const obs = new MutationObserver(() => {
    if (__lhTableCardsDebounce) clearTimeout(__lhTableCardsDebounce);
    __lhTableCardsDebounce = setTimeout(() => enhanceTablesAsCards(document), 120);
  });
  obs.observe(document.body, { childList: true, subtree: true });
}

// Run once on load (most pages import ui.js)
try {
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', _startTableCardsObserver);
  } else {
    _startTableCardsObserver();
  }
} catch (e) {}
