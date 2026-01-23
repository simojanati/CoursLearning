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
