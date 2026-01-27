import './admin-mode.js';
import { ensureTopbar } from './layout.js';
import { initI18n, t } from './i18n.js';
import { requireAuth } from './auth.js';
import { qs, escapeHTML, renderEmpty } from './ui.js';
import { adminListUsers, adminUpdateUserRole, adminCreateUser, adminRegenerateVerifyCode, adminRegenerateResetCode, adminClearResetRequest, adminAlerts } from './api.js';

function tOr(key, fallback){ const v = t(key); return (v === key) ? fallback : v; }



function getAppPagesBaseUrl(){
  try {
    const u = new URL(window.location.href);
    const basePath = u.pathname.replace(/\/app\/pages\/.*$/, '/app/pages');
    return u.origin + basePath;
  } catch(e){ return ''; }
}

function buildVerifyTemplate(u){
  const base = getAppPagesBaseUrl();
  const link = base ? (base + '/verify.html?email=' + encodeURIComponent(u.email||'')) : '';
  const name = ((u.firstName||'') + ' ' + (u.lastName||'')).trim() || (u.email||'');
  const code = String(u.verifyCode||'').trim();

  const subject = `LearnHub - Code d’activation`;
  const body = [
    `Bonjour ${name},`,
    ``,
    `Voici votre code d’activation LearnHub : ${code}`,
    link ? `Lien: ${link}` : '',
    ``,
    `Si vous n’avez pas demandé de compte, ignorez ce message.`,
    ``,
    `— Admin LearnHub`
  ].filter(Boolean).join('\n');

  return { title: tOr('admin.users.tpl.activateTitle','Template activation'), subject, body };
}

function buildResetTemplate(u){
  const base = getAppPagesBaseUrl();
  const link = base ? (base + '/reset.html?email=' + encodeURIComponent(u.email||'')) : '';
  const name = ((u.firstName||'') + ' ' + (u.lastName||'')).trim() || (u.email||'');
  const code = String(u.resetCode||'').trim();

  const subject = `LearnHub - Code de réinitialisation`;
  const body = [
    `Bonjour ${name},`,
    ``,
    `Voici votre code de réinitialisation LearnHub : ${code}`,
    link ? `Page: ${link}` : '',
    ``,
    `Ce code expire dans 1 heure. Si vous n’avez pas demandé cela, ignorez ce message.`,
    ``,
    `— Admin LearnHub`
  ].filter(Boolean).join('\n');

  return { title: tOr('admin.users.tpl.resetTitle','Template reset'), subject, body };
}

function openTemplateModal(tpl){
  const titleEl = qs('#tplModalTitle');
  const hintEl = qs('#tplModalHint');
  const textEl = qs('#tplModalText');
  const copied = qs('#tplCopied');

  if (titleEl) titleEl.textContent = tpl.title || 'Template';
  if (hintEl) hintEl.textContent = tOr('admin.users.tpl.hint','Copiez/collez ce modèle puis envoyez-le manuellement.');
  if (textEl) textEl.value = `SUBJECT: ${tpl.subject}\n\n${tpl.body}`;
  if (copied) copied.classList.add('d-none');

  // bootstrap modal
  const modalEl = document.getElementById('tplModal');
  if (!modalEl) return;
  const modal = window.bootstrap ? new window.bootstrap.Modal(modalEl) : null;
  modal?.show();

  const btnCopy = qs('#btnCopyTpl');
  if (btnCopy){
    btnCopy.onclick = async () => {
      try{
        await navigator.clipboard.writeText(textEl.value || '');
        if (copied){
          copied.textContent = tOr('actions.copied','Copied ✅');
          copied.classList.remove('d-none');
        }
      } catch(e){
        // fallback select
        textEl.focus(); textEl.select();
        document.execCommand('copy');
        if (copied){
          copied.textContent = tOr('actions.copied','Copied ✅');
          copied.classList.remove('d-none');
        }
      }
    };
  }
}

function renderPending(pending){
  const box = qs('#adminPending');
  if (!box) return;
  const v = pending?.verify || 0;
  const r = pending?.reset || 0;
  if (v || r){
    box.textContent = `${tOr('admin.pending','Pending')}: ${tOr('admin.pending.verify','activation')}=${v}, ${tOr('admin.pending.reset','reset')}=${r}`;
    box.classList.remove('d-none');
  } else {
    box.classList.add('d-none');
  }
}

function renderUsers(users){
  const tbody = qs('#usersTbody');
  if (!tbody) return;

  if (!users || !users.length){
    renderEmpty(tbody, tOr('admin.users.empty','No users'));
    return;
  }

  tbody.innerHTML = users.map(u => {
    const email = escapeHTML(u.email||'');
    const name = escapeHTML(((u.firstName||'') + ' ' + (u.lastName||'')).trim());
    const role = escapeHTML(u.role||'student');
    const verified = (String(u.verified||'') === 'true' || u.verified === true);

    const hasVerify = !!u._hasVerifyPending;
    const hasReset  = !!u._hasResetPending;

    const badgeVerify = (!verified && hasVerify) ? `<span class="badge bg-warning ms-1">ACT</span>` : '';
    const badgeReset  = hasReset ? `<span class="badge bg-info ms-1">RESET</span>` : '';

    // Activation buttons: always visible. If already verified, keep them disabled.
    const actDisabled = verified ? 'disabled' : '';
    const btnActivate = `
      <button class="btn btn-outline-primary btn-sm me-1" data-act="tpl-verify" data-email="${email}" ${actDisabled}>
        ${escapeHTML(verified ? tOr('admin.users.activated','Activé') : tOr('admin.users.activation','Activation'))}
      </button>
      <button class="btn btn-outline-secondary btn-sm me-1" data-act="regen-verify" data-email="${email}" ${actDisabled}>
        ${escapeHTML(tOr('admin.users.regenActivation','Régénérer'))}
      </button>
    `;

    // Reset buttons: show regenerate/clear only if there is an active reset request.
    const btnReset = `
      <button class="btn btn-outline-primary btn-sm me-1" data-act="tpl-reset" data-email="${email}">
        ${escapeHTML(tOr('admin.users.reset','Reset'))}
      </button>
      ${hasReset ? `
        <button class="btn btn-outline-secondary btn-sm me-1" data-act="regen-reset" data-email="${email}">
          ${escapeHTML(tOr('admin.users.regenReset','Régénérer reset'))}
        </button>
        <button class="btn btn-outline-danger btn-sm" data-act="clear-reset" data-email="${email}">
          ${escapeHTML(tOr('admin.users.clear','Vider'))}
        </button>
      ` : ''}
    `;

    return `
      <tr>
        <td><div class="fw-semibold">${email} ${badgeVerify}${badgeReset}</div></td>
        <td>${name || '<span class="text-muted">—</span>'}</td>
        <td>
          <select class="form-select form-select-sm" data-act="role" data-email="${email}">
            <option value="student" ${role==='student'?'selected':''}>student</option>
            <option value="admin" ${role==='admin'?'selected':''}>admin</option>
          </select>
        </td>
        <td>
          ${verified ? '<span class="badge bg-success">OK</span>' : '<span class="badge bg-secondary">NO</span>'}
        </td>
        <td class="text-nowrap">
          ${btnActivate}
          ${btnReset}
        </td>
      </tr>
    `;
  }).join('');

  // bind actions
  tbody.querySelectorAll('[data-act="role"]').forEach(sel => {
    sel.addEventListener('change', async (e)=>{
      const email = e.target.getAttribute('data-email');
      const role = e.target.value;
      await adminUpdateUserRole({ email, role });
    });
  });

  tbody.querySelectorAll('button[data-act]').forEach(btn => {
    btn.addEventListener('click', async ()=>{
      const act = btn.getAttribute('data-act');
      const email = btn.getAttribute('data-email');
      const u = users.find(x => String(x.email||'') === String(email||''));
      if (!u) return;

      if (act === 'tpl-verify'){
        // ensure we have a valid code
        if (!u._hasVerifyPending){
          const rr = await adminRegenerateVerifyCode({ email: u.email });
          u.verifyCode = rr.verifyCode || u.verifyCode;
          u.verifyExpiresAt = rr.verifyExpiresAt || u.verifyExpiresAt;
          u._hasVerifyPending = true;
        }
        openTemplateModal(buildVerifyTemplate(u));
      }
      if (act === 'regen-verify'){
        const rr = await adminRegenerateVerifyCode({ email: u.email });
        u.verifyCode = rr.verifyCode || u.verifyCode;
        u.verifyExpiresAt = rr.verifyExpiresAt || u.verifyExpiresAt;
        u._hasVerifyPending = true;
        openTemplateModal(buildVerifyTemplate(u));
      }
      if (act === 'tpl-reset'){
        if (!u._hasResetPending){
          const rr = await adminRegenerateResetCode({ email: u.email });
          u.resetCode = rr.resetCode || u.resetCode;
          u.resetExpiresAt = rr.resetExpiresAt || u.resetExpiresAt;
          u._hasResetPending = true;
        }
        openTemplateModal(buildResetTemplate(u));
      }
      if (act === 'regen-reset'){
        const rr = await adminRegenerateResetCode({ email: u.email });
        u.resetCode = rr.resetCode || u.resetCode;
        u.resetExpiresAt = rr.resetExpiresAt || u.resetExpiresAt;
        u._hasResetPending = true;
        openTemplateModal(buildResetTemplate(u));
      }
      if (act === 'clear-reset'){
        await adminClearResetRequest({ email: u.email });
        u.resetCode = '';
        u.resetExpiresAt = '';
        u.resetRequestedAt = '';
        u._hasResetPending = false;
        alert('Cleared');
      }
    });
  });
}

async function init(){
  // Topbar is injected dynamically; it must exist before i18n wires the language dropdown.
  await ensureTopbar();
  initI18n();
  requireAuth({ roles: ['admin'] });

  // Refresh button
  qs('#btnRefresh')?.addEventListener('click', async () => {
    await load();
  });

  // Notifications (manual polling)
  // Enable by default if permission already granted
  if (('Notification' in window) && Notification.permission === 'granted' && localStorage.getItem(LS_NOTIFY_ENABLED) === null){
    setNotifyEnabled_(true);
  }

  // Create user form (existing UI)
  const form = qs('#createUserForm');
  form?.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const email = qs('#cuEmail').value.trim();
    const password = qs('#cuPassword').value.trim();
    const role = qs('#cuRole').value;
    const firstName = qs('#cuFirstName').value.trim();
    const lastName = qs('#cuLastName').value.trim();
    const sendInvite = !!qs('#cuSendInvite')?.checked;
    const includePassword = !!qs('#cuIncludePassword')?.checked;

    const btn = qs('#btnCreateUser');
    const sp = qs('#createUserSpinner');

    try{
      if (btn) btn.disabled=true;
      if (sp) sp.classList.remove('d-none');
      const res = await adminCreateUser({ email, password, role, firstName, lastName, sendInvite, includePassword });
      // If invite requested, open template immediately
      if (res?.invite?.resetCode){
        const u = { email, firstName, lastName, resetCode: res.invite.resetCode, _hasResetPending:true };
        openTemplateModal(buildResetTemplate(u));
      } else {
        alert('User created');
      }
      form.reset();
    } finally {
      if (btn) btn.disabled=false;
      if (sp) sp.classList.add('d-none');
    }
    await load();
  });

  await load();
}


async function load(){
  const res = await adminListUsers();
  renderPending(res.pending);
  renderUsers(res.users || []);
}

init();
