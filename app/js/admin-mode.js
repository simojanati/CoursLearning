import { hasRole, getUser } from './auth.js';
import { adminAlerts } from './api.js';

// Admin menu visibility (UI only). Real security is enforced in backend.
// Admin = role 'admin'
export function isAdminMode(){
  return hasRole('admin');
}


export function canAccessScanAI(){
  const u = getUser();
  const sa = (u && (u.scanAccess === true || String(u.scanAccess||'').toLowerCase() === 'true' || String(u.scanAccess||'') === '1' || String(u.scanAccess||'').toLowerCase() === 'yes'));
  return hasRole('admin') || sa;
}

export function applyAdminMode(){
  const on = isAdminMode();
  document.body.classList.toggle('admin-mode', on);
  document.querySelectorAll('[data-admin-only]').forEach(el => {
    el.classList.toggle('d-none', !on);
  });

  const scanOn = canAccessScanAI();
  document.querySelectorAll('[data-scan-access-only]').forEach(el => {
    el.classList.toggle('d-none', !scanOn);
  });
}

// run immediately
applyAdminMode();


export async function initAdminAlerts(){
  try{
    if (!isAdminMode()) return;
    const res = await adminAlerts();
    const v = res?.pending?.verify || 0;
    const r = res?.pending?.reset || 0;
    const total = v + r;

    // Find menu link to users
    const link = document.querySelector('a[href="users.html"], a[href="./users.html"]');
    if (!link) return;

    let badge = link.querySelector('.lh-badge');
    if (!badge){
      badge = document.createElement('span');
      badge.className = 'badge bg-danger lh-badge ms-2';
      badge.style.fontSize = '0.75rem';
      link.appendChild(badge);
    }
    if (total > 0){
      badge.textContent = String(total);
      badge.classList.remove('d-none');
      badge.title = `Pending: activation=${v}, reset=${r}`;
    } else {
      badge.classList.add('d-none');
    }
  } catch(e){
    // ignore
  }
}

// auto-run
document.addEventListener('DOMContentLoaded', ()=>{
  applyAdminMode();
  initAdminAlerts();
});


// Re-apply when user profile changes (e.g., scanAccess updated via authMe)
try{
  window.addEventListener('lh:userUpdated', () => applyAdminMode());
} catch {}
