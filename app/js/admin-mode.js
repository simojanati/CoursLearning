// Admin menu visibility (simple, not secure).
// Use ?admin=1 to enable, or localStorage 'adminMode' = '1'
(function(){
  try {
    const url = new URL(window.location.href);
    const p = url.searchParams.get('admin');
    if (p === '1') localStorage.setItem('adminMode','1');
  } catch {}
})();

export function isAdminMode(){
  try { return localStorage.getItem('adminMode') === '1'; } catch { return false; }
}

export function applyAdminMode(){
  const on = isAdminMode();
  document.body.classList.toggle('admin-mode', on);
  document.querySelectorAll('[data-admin-only]').forEach(el => {
    el.classList.toggle('d-none', !on);
  });
}

// run immediately
applyAdminMode();
