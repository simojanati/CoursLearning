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


/* ===================== AUTH (JWT + Users) =====================

Roles:
- viewer: only index.html (front-end), no API access besides platformSettings and auth endpoints
- student: can access content endpoints
- admin  : can access everything + upsert/delete + users admin

Script Properties required:
- AUTH_SECRET : secret key for JWT HMAC
Optional:
- APP_PAGES_BASE_URL : e.g. https://your-gh-pages-domain/app/pages (used if client doesn't send appBaseUrl)

Sheets used:
- Users: userId, email, passwordHash, salt, role, firstName, lastName, verified, verifiedAt, createdAt, updatedAt
- EmailTokens: tokenHash, email, type, expiresAt, usedAt, createdAt
*/

function getAuthSecret_(){
  const secret = PropertiesService.getScriptProperties().getProperty('AUTH_SECRET');
  if (!secret) throw new Error('AUTH_SECRET_NOT_SET');
  return String(secret);
}

function b64urlEncode_(bytes){
  const b64 = Utilities.base64Encode(bytes).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  return b64;
}
function b64urlEncodeStr_(str){
  const bytes = Utilities.newBlob(str).getBytes();
  return b64urlEncode_(bytes);
}
function b64urlDecodeStr_(b64url){
  let s = String(b64url||'').replace(/-/g,'+').replace(/_/g,'/');
  while (s.length % 4) s += '=';
  const bytes = Utilities.base64Decode(s);
  return Utilities.newBlob(bytes).getDataAsString();
}

function signJwt_(payload){
  const header = { alg:'HS256', typ:'JWT' };
  const encHeader = b64urlEncodeStr_(JSON.stringify(header));
  const encPayload = b64urlEncodeStr_(JSON.stringify(payload));
  const data = encHeader + '.' + encPayload;
  const sigBytes = Utilities.computeHmacSha256Signature(data, getAuthSecret_());
  const sig = b64urlEncode_(sigBytes);
  return data + '.' + sig;
}

function constantTimeEq_(a,b){
  a=String(a||''); b=String(b||'');
  if (a.length !== b.length) return false;
  let r=0;
  for (let i=0;i<a.length;i++) r |= (a.charCodeAt(i) ^ b.charCodeAt(i));
  return r===0;
}

function verifyJwt_(token){
  try{
    const parts = String(token||'').split('.');
    if (parts.length !== 3) return null;
    const data = parts[0]+'.'+parts[1];
    const sigBytes = Utilities.computeHmacSha256Signature(data, getAuthSecret_());
    const expected = b64urlEncode_(sigBytes);
    if (!constantTimeEq_(expected, parts[2])) return null;
    const payload = JSON.parse(b64urlDecodeStr_(parts[1]) || '{}');
    const now = Math.floor(Date.now()/1000);
    if (payload.exp && now > Number(payload.exp)) return null;
    return payload;
  } catch(e){ return null; }
}

function sha256Hex_(str){
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str, Utilities.Charset.UTF_8);
  return bytes.map(b => ('0'+(b<0?(b+256):b).toString(16)).slice(-2)).join('');
}


function generateOtpCode_(){
  // 6-digit numeric code
  return String(Math.floor(100000 + Math.random()*900000));
}



function addMinutesIso_(minutes){
  return new Date(Date.now() + minutes*60*1000).toISOString();
}
function isIsoExpired_(iso){
  if (!iso) return true;
  const t = new Date(String(iso)).getTime();
  if (isNaN(t)) return true;
  return Date.now() > t;
}


function ensureSheetWithHeaders_(ss, name, headers){
  let sh = ss.getSheetByName(name);
  if (!sh){
    sh = ss.insertSheet(name);
    sh.getRange(1,1,1,headers.length).setValues([headers]);
    return sh;
  }
  const existing = sh.getRange(1,1,1,sh.getLastColumn()||1).getValues()[0].map(x=>String(x||'').trim()).filter(Boolean);
  // add missing headers at end
  const missing = headers.filter(h => existing.indexOf(h) === -1);
  if (missing.length){
    const all = existing.concat(missing);
    sh.getRange(1,1,1,all.length).setValues([all]);
  }
  return sh;
}

function ensureUsersSheet_(ss){
  return ensureSheetWithHeaders_(ss,'Users',[
    'userId','email','passwordHash','salt','role','firstName','lastName',
    'verified','verifiedAt',
    'verifyCode','verifyExpiresAt',
    'resetCode','resetExpiresAt','resetRequestedAt',
    'createdAt','updatedAt'
  ]);
}

// NOTE: EmailTokens sheet kept for backward compatibility but no longer used.
function ensureEmailTokensSheet_(ss){
  return ensureSheetWithHeaders_(ss,'EmailTokens',[
    'tokenHash','email','type','expiresAt','usedAt','createdAt'
  ]);
}

function findUserByEmail_(ss, email){
  email = String(email||'').trim().toLowerCase();
  const sh = ensureUsersSheet_(ss);
  const values = sh.getDataRange().getValues();
  const headers = values.shift().map(String);
  const idxEmail = headers.indexOf('email');
  if (idxEmail<0) return null;
  for (let r=0;r<values.length;r++){
    const row = values[r];
    const em = String(row[idxEmail]||'').trim().toLowerCase();
    if (em === email){
      const obj = {};
      headers.forEach((h,i)=> obj[h]=row[i]);
      return obj;
    }
  }
  return null;
}

function upsertUser_(ss, user){
  const sh = ensureUsersSheet_(ss);
  const values = sh.getDataRange().getValues();
  const headers = values.shift().map(String);
  const idxId = headers.indexOf('userId');
  const idxEmail = headers.indexOf('email');
  const userId = String(user.userId||'');
  const email = String(user.email||'').trim().toLowerCase();

  let targetRow = -1;
  for (let r=0;r<values.length;r++){
    const row = values[r];
    if (userId && String(row[idxId]||'') === userId) { targetRow = r+2; break; }
    if (email && String(row[idxEmail]||'').trim().toLowerCase() === email) { targetRow = r+2; break; }
  }
  const nowIso = new Date().toISOString();
  user.updatedAt = nowIso;
  if (!user.createdAt) user.createdAt = nowIso;

  const rowOut = headers.map(h => (h in user) ? user[h] : '');
  if (targetRow === -1){
    sh.appendRow(rowOut);
  } else {
    sh.getRange(targetRow,1,1,rowOut.length).setValues([rowOut]);
  }
}

function requireAuth_(ss, params){
  const token = String(params.token || '');
  if (!token) return { error:'AUTH_REQUIRED' };
  const payload = verifyJwt_(token);
  if (!payload) return { error:'INVALID_TOKEN' };
  // Optionally verify user still exists/role
  const user = findUserByEmail_(ss, String(payload.email||''));
  if (!user) return { error:'INVALID_TOKEN' };
  const role = String(user.role || payload.role || 'student');
  const scanAccess = (function(u){
    const v = (u && u.scanAccess != null) ? u.scanAccess : '';
    return v === true || String(v).toLowerCase() === 'true' || String(v) === '1' || String(v).toLowerCase() === 'yes';
  })(user);
  return { ok:true, user: { userId:String(user.userId), email:String(user.email), role, firstName:user.firstName||'', lastName:user.lastName||'', scanAccess: scanAccess, verified:String(user.verified||'')==='true' || user.verified===true }, role };
}

function issueTokenForUser_(user){
  const now = Math.floor(Date.now()/1000);
  return signJwt_({
    sub: String(user.userId),
    email: String(user.email),
    role: String(user.role||'student'),
    iat: now,
    exp: now + 60*60*24*7
  });
}

function getBrandSettings_(params){
  try{
    const ps = platformSettings_(params);
    const s = (ps && ps.settings) ? ps.settings : {};
    return {
      appName: s.appName || 'LearnHub',
      logoUrl: s.logoUrl || '',
      primaryColor: s.primaryColor || '#696cff',
      footer_fr: s.footer_fr || '© 2026 LearnHub. Tous droits réservés.',
      footer_en: s.footer_en || '© 2026 LearnHub. All rights reserved.'
    };
  }catch(e){
    return { appName:'LearnHub', logoUrl:'', primaryColor:'#696cff', footer_fr:'© 2026 LearnHub.', footer_en:'© 2026 LearnHub.' };
  }
}

function emailTemplate_(params, opts){
  const b = getBrandSettings_(params);
  const title = String(opts.title || b.appName);
  const preheader = String(opts.preheader || '');
  const bodyHtml = String(opts.bodyHtml || '');
  const ctaText = String(opts.ctaText || '').trim();
  const ctaUrl = String(opts.ctaUrl || '').trim();
  const locale = String(opts.locale || 'en').toLowerCase();
  const footer = (locale === 'fr') ? b.footer_fr : b.footer_en;

  const logo = b.logoUrl
    ? '<img src="'+ b.logoUrl +'" alt="'+ b.appName +'" style="height:42px;display:block" />'
    : '<div style="font-size:22px;font-weight:700;color:#111827">'+ b.appName +'</div>';

  const cta = (ctaText && ctaUrl)
    ? '<div style="text-align:center;margin:24px 0">' +
      '<a href="'+ ctaUrl +'" style="background:'+ b.primaryColor +';color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;display:inline-block;font-weight:600">'+
      ctaText +'</a></div>'
    : '';

  // hidden preheader
  const pre = preheader
    ? '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">'+ preheader +'</div>'
    : '';

  return pre +
  '<div style="background:#f5f7fb;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#111827">' +
    '<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 6px 24px rgba(16,24,40,.08)">' +
      '<div style="padding:18px 22px;border-bottom:1px solid #eef2f7;display:flex;align-items:center;gap:12px;justify-content:center">'+
        logo +
      '</div>' +
      '<div style="padding:22px">' +
        '<h2 style="margin:0 0 10px 0;font-size:18px;line-height:1.3">'+ title +'</h2>' +
        '<div style="font-size:14px;line-height:1.6;color:#374151">'+ bodyHtml +'</div>' +
        cta +
        (opts.noteHtml ? '<div style="font-size:12px;line-height:1.5;color:#6b7280;margin-top:14px">'+ String(opts.noteHtml) +'</div>' : '') +
      '</div>' +
      '<div style="padding:14px 22px;background:#fbfcff;border-top:1px solid #eef2f7;font-size:12px;color:#6b7280;text-align:center">' +
        footer +
      '</div>' +
    '</div>' +
  '</div>';
}


function getAppPagesBaseUrl_(params){
  // Frontend sends appBaseUrl like: https://<host>/app/pages
  // Keep it safe and predictable for email links.
  const raw = (params && (params.appPagesBaseUrl || params.appBaseUrl || params.app_pages_base_url)) ? String(params.appPagesBaseUrl || params.appBaseUrl || params.app_pages_base_url) : '';
  if (!raw) return '';
  return raw.replace(/\/$/, '');
}

function sendVerificationEmail_(params, email, token){
  // Email sending disabled (manual admin send).
  return;
}

function sendResetEmail_(params, email, token){
  // Email sending disabled (manual admin send).
  return;
}

function sendInviteEmail_(params, email, token, opts){
  // Email sending disabled (manual admin send).
  return;
}


function createEmailToken_(ss, email, type, ttlSeconds){
  const sh = ensureEmailTokensSheet_(ss);
  const rawToken = Utilities.getUuid().replace(/-/g,'') + Utilities.getUuid().replace(/-/g,'');
  const tokenHash = sha256Hex_(rawToken);
  const now = new Date();
  const expires = new Date(now.getTime() + ttlSeconds*1000);
  sh.appendRow([tokenHash, String(email).trim().toLowerCase(), String(type), expires.toISOString(), '', now.toISOString()]);
  return rawToken;
}

function consumeEmailToken_(ss, email, type, rawToken){
  email = String(email||'').trim().toLowerCase();
  type = String(type||'');
  const sh = ensureEmailTokensSheet_(ss);
  const values = sh.getDataRange().getValues();
  const headers = values.shift().map(String);
  const idxHash = headers.indexOf('tokenHash');
  const idxEmail = headers.indexOf('email');
  const idxType = headers.indexOf('type');
  const idxExpires = headers.indexOf('expiresAt');
  const idxUsed = headers.indexOf('usedAt');
  if (idxHash<0) return { ok:false, error:'TOKEN_STORE_INVALID' };

  const tokenHash = sha256Hex_(String(rawToken||''));
  const now = new Date();

  for (let r=0;r<values.length;r++){
    const row = values[r];
    if (String(row[idxHash]||'') === tokenHash &&
        String(row[idxEmail]||'').trim().toLowerCase() === email &&
        String(row[idxType]||'') === type){

      const usedAt = String(row[idxUsed]||'');
      if (usedAt) return { ok:false, error:'TOKEN_USED' };

      const expiresAt = new Date(String(row[idxExpires]||''));
      if (expiresAt.toString() === 'Invalid Date' || now > expiresAt) return { ok:false, error:'TOKEN_EXPIRED' };

      // mark used
      const usedIso = now.toISOString();
      sh.getRange(r+2, idxUsed+1).setValue(usedIso);
      return { ok:true };
    }
  }
  return { ok:false, error:'TOKEN_NOT_FOUND' };
}

/* =================== END AUTH SECTION =================== */



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
  const ss = getSpreadsheet_(params);
  const PUBLIC = {
    'platformSettings': true,
    'authRegister': true,
    'authLogin': true,
    'authMe': true,
    'authVerifyCode': true,
    'authForgotPassword': true,
    'authResetPassword': true
  };
  const ADMIN = {
    'upsert': true,
    'delete': true,
    'dataHealth': true,
    'adminUsersList': true,
    'adminUpdateUserRole': true,
    'adminCreateUser': true,
    'adminAlerts': true,
    'adminRegenerateVerifyCode': true,
    'adminRegenerateResetCode': true,
    'adminClearResetRequest': true
  };

  if (!PUBLIC[action]) {
    const auth = requireAuth_(ss, params);
    if (auth.error) return auth;
    if (!auth.user.verified) return { error: 'EMAIL_NOT_VERIFIED' };
    if (ADMIN[action] && auth.role !== 'admin') return { error: 'FORBIDDEN' };
    // keep for potential downstream use
    params._auth = auth;
  }

  switch (action) {
    case 'platformSettings':
      return platformSettings_(params);

    // -------- AUTH --------
    case 'authRegister':
      return authRegister_(params);
    case 'authLogin':
      return authLogin_(params);
    case 'authMe':
      return authMe_(params);
    case 'authVerifyCode':
      return authVerifyCode_(params);
    case 'authForgotPassword':
      return authForgotPassword_(params);
    case 'authResetPassword':
      return authResetPassword_(params);

    // -------- ADMIN: USERS --------
    case 'adminUsersList':
      return adminUsersList_(params);
    case 'adminUpdateUserRole':
      return adminUpdateUserRole_(params);
    case 'adminCreateUser':
      return adminCreateUser_(params);
    case 'adminAlerts':
      return adminAlerts_(params);
    case 'adminRegenerateVerifyCode':
      return adminRegenerateVerifyCode_(params);
    case 'adminRegenerateResetCode':
      return adminRegenerateResetCode_(params);
    case 'adminClearResetRequest':
      return adminClearResetRequest_(params);

    // (legacy)
        
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
  // Backward-compatible alias: health() returns the same payload as dataHealth
  const ss = getSpreadsheet_(params);
  return _lhDataHealth_(ss);
}


function authVerifyCode_(params){
  const ss = getSpreadsheet_(params);
  const email = String(params.email || '').trim().toLowerCase();
  const code = String(params.code || '').trim();

  if (!email || email.indexOf('@') === -1) return { error: 'INVALID_EMAIL' };
  if (!code || code.length < 4) return { error: 'INVALID_CODE' };

  const user = findUserByEmail_(ss, email);
  if (!user) return { error: 'USER_NOT_FOUND' };

  const verified = String(user.verified||'') === 'true' || user.verified === true;
  if (verified) return { ok: true };

  const expected = String(user.verifyCode || '').trim();
  const expiresAt = String(user.verifyExpiresAt || '');
  if (!expected) return { error: 'CODE_NOT_FOUND' };
  if (isIsoExpired_(expiresAt)) return { error: 'CODE_EXPIRED' };

  if (String(code) !== expected) return { error: 'CODE_INVALID' };

  user.verified = true;
  user.verifiedAt = new Date().toISOString();
  user.verifyCode = '';
  user.verifyExpiresAt = '';
  upsertUser_(ss, user);

  const jwt = issueTokenForUser_(user);
  const scanAccess = (function(u){
    const v = (u && u.scanAccess != null) ? u.scanAccess : '';
    return v === true || String(v).toLowerCase() === 'true' || String(v) === '1' || String(v).toLowerCase() === 'yes';
  })(user);
  return { token: jwt, user: { userId: String(user.userId), email: String(user.email), role: String(user.role||'student'), firstName: user.firstName||'', lastName: user.lastName||'', scanAccess: scanAccess, verified:true } };
}



function authResendVerification_(params){ return { error: 'DEPRECATED' }; }


function authConfirmEmail_(params){ return { error: 'DEPRECATED' }; }


function authLogin_(params){
  const ss = getSpreadsheet_(params);
  const email = String(params.email || '').trim().toLowerCase();
  const password = String(params.password || '');

  const user = findUserByEmail_(ss, email);
  if (!user) return { error: 'INVALID_CREDENTIALS' };

  const salt = String(user.salt || '');
  const expected = String(user.passwordHash || '');
  const actual = sha256Hex_(salt + ':' + password);
  if (actual !== expected) return { error: 'INVALID_CREDENTIALS' };

  const verified = String(user.verified||'') === 'true' || user.verified === true;
  if (!verified) return { error: 'EMAIL_NOT_VERIFIED' };


  const scanAccess = (function(u){
    const v = (u && u.scanAccess != null) ? u.scanAccess : '';
    return v === true || String(v).toLowerCase() === 'true' || String(v) === '1' || String(v).toLowerCase() === 'yes';
  })(user);
  const jwt = issueTokenForUser_(user);
  return { token: jwt, user: { userId: String(user.userId), email, role: String(user.role||'student'), firstName: user.firstName||'', lastName: user.lastName||'', scanAccess: scanAccess, verified:true } };
}

// Self-service registration (manual verification code displayed to admin in Users page)
function authRegister_(params){
  const ss = getSpreadsheet_(params);
  const email = String(params.email || '').trim().toLowerCase();
  const password = String(params.password || '');
  const firstName = String(params.firstName || '').trim();
  const lastName = String(params.lastName || '').trim();
  const role = 'student';

  if (!email || email.indexOf('@') === -1) return { error: 'INVALID_EMAIL' };
  if (!password || password.length < 6) return { error: 'WEAK_PASSWORD' };

  const existing = findUserByEmail_(ss, email);
  if (existing) return { error: 'EMAIL_EXISTS' };

  const userId = Utilities.getUuid();
  const salt = Utilities.getUuid().replace(/-/g,'');
  const passwordHash = sha256Hex_(salt + ':' + password);

  const user = {
    userId,
    email,
    passwordHash,
    salt,
    role,
    firstName,
    lastName,
    verified: false,
    verifiedAt: '',
    // activation code (manual)
    verifyCode: generateOtpCode_(),
    verifyExpiresAt: addMinutesIso_(60 * 24), // 24h
    // reset code (manual)
    resetCode: '',
    resetExpiresAt: '',
    resetRequestedAt: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  upsertUser_(ss, user);
// Verify code is returned; UI reveals it only after puzzle (3 attempts)
  return {
    ok: true,
    needsVerification: true,
    verifyCode: user.verifyCode,
    user: { userId, email, role, firstName, lastName, verified: false }
  };
}

function authMe_(params){
  const ss = getSpreadsheet_(params);
  const auth = requireAuth_(ss, params);
  if (auth.error) return auth;
  return { user: auth.user };
}

function authForgotPassword_(params){
  const ss = getSpreadsheet_(params);
  const email = String(params.email || '').trim().toLowerCase();
  if (!email || email.indexOf('@') === -1) return { ok: true };

  const user = findUserByEmail_(ss, email);
  if (!user) return { ok: true }; // do not reveal

  const verified = String(user.verified||'') === 'true' || user.verified === true;
  if (!verified){
    // still pending activation: regenerate verify code
    user.verifyCode = generateOtpCode_();
    user.verifyExpiresAt = addMinutesIso_(60*24);
    upsertUser_(ss, user);
return { ok: true };
  }

  user.resetCode = generateOtpCode_();
  user.resetExpiresAt = addMinutesIso_(75); // 1h15 (UI says ~1h)
  user.resetRequestedAt = new Date().toISOString();
  upsertUser_(ss, user);
return { ok: true };
}


function authResetPassword_(params){
  const ss = getSpreadsheet_(params);
  const email = String(params.email || '').trim().toLowerCase();
  const code = String(params.code || '').trim();
  const newPassword = String(params.newPassword || '');

  if (!email || email.indexOf('@') === -1) return { error: 'INVALID_EMAIL' };
  if (!code) return { error: 'INVALID_CODE' };
  if (!newPassword || newPassword.length < 6) return { error: 'WEAK_PASSWORD' };

  const user = findUserByEmail_(ss, email);
  if (!user) return { error: 'USER_NOT_FOUND' };

  const expected = String(user.resetCode || '').trim();
  const expiresAt = String(user.resetExpiresAt || '');
  if (!expected) return { error: 'RESET_NOT_REQUESTED' };
  if (isIsoExpired_(expiresAt)) return { error: 'CODE_EXPIRED' };
  if (String(code) !== expected) return { error: 'CODE_INVALID' };

  const salt = Utilities.getUuid().replace(/-/g,'');
  const passwordHash = sha256Hex_(salt + ':' + newPassword);
  user.salt = salt;
  user.passwordHash = passwordHash;
  user.resetCode = '';
  user.resetExpiresAt = '';
  user.resetRequestedAt = '';
  upsertUser_(ss, user);

  return { ok: true };
}


/* ===================== ADMIN USERS ENDPOINTS ===================== */

function adminUsersList_(params){
  const ss = getSpreadsheet_(params);
  const sh = ensureUsersSheet_(ss);
  const values = sh.getDataRange().getValues();
  const headers = values.shift().map(String);

  let verifyPending = 0;
  let resetPending = 0;

  const users = values.map(row => {
    const obj = {};
    headers.forEach((h,i)=> obj[h]=row[i]);

    const verified = String(obj.verified||'') === 'true' || obj.verified === true;
    const hasVerify = !verified && String(obj.verifyCode||'').trim() && !isIsoExpired_(obj.verifyExpiresAt);
    const hasReset  = String(obj.resetCode||'').trim() && !isIsoExpired_(obj.resetExpiresAt);

    if (hasVerify) verifyPending++;
    if (hasReset) resetPending++;

    // remove sensitive
    delete obj.passwordHash;
    delete obj.salt;

    obj._hasVerifyPending = hasVerify;
    obj._hasResetPending = hasReset;
    return obj;
  }).filter(u => u.email);

  return { users, pending: { verify: verifyPending, reset: resetPending } };
}


function adminAlerts_(params){
  const res = adminUsersList_(params);
  return { pending: res.pending || { verify:0, reset:0 } };
}

function adminRegenerateVerifyCode_(params){
  const ss = getSpreadsheet_(params);
  const email = String(params.email||'').trim().toLowerCase();
  if (!email) return { error:'INVALID_EMAIL' };

  const user = findUserByEmail_(ss, email);
  if (!user) return { error:'USER_NOT_FOUND' };

  const verified = String(user.verified||'') === 'true' || user.verified === true;
  if (verified) return { ok:true, message:'ALREADY_VERIFIED' };

  user.verifyCode = generateOtpCode_();
  user.verifyExpiresAt = addMinutesIso_(60*24);
  upsertUser_(ss, user);
  return { ok:true, verifyCode: String(user.verifyCode), verifyExpiresAt: String(user.verifyExpiresAt) };
}

function adminRegenerateResetCode_(params){
  const ss = getSpreadsheet_(params);
  const email = String(params.email||'').trim().toLowerCase();
  if (!email) return { error:'INVALID_EMAIL' };

  const user = findUserByEmail_(ss, email);
  if (!user) return { error:'USER_NOT_FOUND' };

  user.resetCode = generateOtpCode_();
  user.resetExpiresAt = addMinutesIso_(30);
  user.resetRequestedAt = user.resetRequestedAt || new Date().toISOString();
  upsertUser_(ss, user);
  return { ok:true, resetCode: String(user.resetCode), resetExpiresAt: String(user.resetExpiresAt) };
}

function adminClearResetRequest_(params){
  const ss = getSpreadsheet_(params);
  const email = String(params.email||'').trim().toLowerCase();
  if (!email) return { error:'INVALID_EMAIL' };

  const user = findUserByEmail_(ss, email);
  if (!user) return { error:'USER_NOT_FOUND' };

  user.resetCode = '';
  user.resetExpiresAt = '';
  user.resetRequestedAt = '';
  upsertUser_(ss, user);
  return { ok:true };
}



function adminUpdateUserRole_(params){
  const ss = getSpreadsheet_(params);
  const role = String(params.role || '').trim();
  if (!role) return { error: 'INVALID_ROLE' };
  if (['student','admin'].indexOf(role) === -1) return { error: 'INVALID_ROLE' };

  const email = String(params.email || '').trim().toLowerCase();
  let user = null;
  if (email) user = findUserByEmail_(ss, email);
  if (!user && params.userId){
    // find by id (simple scan)
    const sh = ensureUsersSheet_(ss);
    const values = sh.getDataRange().getValues();
    const headers = values.shift().map(String);
    const idxId = headers.indexOf('userId');
    for (let r=0;r<values.length;r++){
      if (String(values[r][idxId]||'') === String(params.userId)){
        user = {};
        headers.forEach((h,i)=> user[h]=values[r][i]);
        break;
      }
    }
  }
  if (!user) return { error:'USER_NOT_FOUND' };

  user.role = role;
  upsertUser_(ss, user);
  return { ok:true };
}

function adminCreateUser_(params){
  const ss = getSpreadsheet_(params);
  const email = String(params.email || '').trim().toLowerCase();
  const password = String(params.password || '');
  const role = String(params.role || 'student');
  const firstName = String(params.firstName || '');
  const lastName = String(params.lastName || '');
  const sendInvite = String(params.sendInvite || '').toLowerCase() === 'true' || params.sendInvite === true;
  const includePassword = String(params.includePassword || '').toLowerCase() === 'true' || params.includePassword === true;

  if (!email || email.indexOf('@') === -1) return { error: 'INVALID_EMAIL' };
  if (!password || password.length < 6) return { error: 'WEAK_PASSWORD' };
  if (['student','admin'].indexOf(role) === -1) return { error: 'INVALID_ROLE' };

  const existing = findUserByEmail_(ss, email);
  if (existing) return { error: 'EMAIL_EXISTS' };

  const userId = Utilities.getUuid();
  const salt = Utilities.getUuid().replace(/-/g,'');
  const passwordHash = sha256Hex_(salt + ':' + password);

  const user = {
    userId, email,
    passwordHash, salt,
    role,
    firstName, lastName,
    verified: true,
    verifiedAt: new Date().toISOString(),
    verifyCode: '',
    verifyExpiresAt: '',
    resetCode: '',
    resetExpiresAt: '',
    resetRequestedAt: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // If admin wants to "invite" manually, generate a reset code (set password) and return it.
  let invite = null;
  if (sendInvite){
    user.resetCode = generateOtpCode_();
    user.resetExpiresAt = addMinutesIso_(60*24); // 24h for invite
    user.resetRequestedAt = new Date().toISOString();
    invite = {
      resetCode: String(user.resetCode),
      resetExpiresAt: String(user.resetExpiresAt),
      includePassword: !!includePassword,
      password: includePassword ? password : ''
    };
  }

  upsertUser_(ss, user);

  return { ok:true, user: { userId, email, role, firstName, lastName, verified:true }, invite: invite };
}


function adminSendInvite_(params){ return { error:'DEPRECATED' }; }


/* =================== END AUTH ENDPOINTS =================== */


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

// --- JSON/JSONP output helper (required for JSONP calls from GitHub Pages) ---
function output_(payload, callback) {
  const json = JSON.stringify(payload || {});
  const cb = (callback !== undefined && callback !== null) ? String(callback).trim() : '';
  if (cb) {
    return ContentService
      .createTextOutput(cb + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}



/* =====================================================================
 * LearnHub content endpoints patch (Domains/Modules/Courses/Lessons/Quiz/Search)
 * - Keeps existing auth/admin code
 * - Adds missing actions used by the frontend (domains/modules/courses/...)
 * - Provides generic upsert/delete for authoring
 * ===================================================================== */

function _lhMeta_(entity){
  const e = String(entity||'').trim();
  const map = {
    Domains:   { sheet: 'Domains',   idKey: 'domainId'   },
    Modules:   { sheet: 'Modules',   idKey: 'moduleId'   },
    Courses:   { sheet: 'Courses',   idKey: 'courseId'   },
    Lessons:   { sheet: 'Lessons',   idKey: 'lessonId'   },
    Quizzes:   { sheet: 'Quizzes',   idKey: 'quizId'     },
    Questions: { sheet: 'Questions', idKey: 'questionId' },
    Users:     { sheet: 'Users',     idKey: 'userId'     }
  };
  if (map[e]) return map[e];
  // also accept lowercase entity names from UI
  const lower = e.toLowerCase();
  if (lower === 'domains') return map.Domains;
  if (lower === 'modules') return map.Modules;
  if (lower === 'courses') return map.Courses;
  if (lower === 'lessons') return map.Lessons;
  if (lower === 'quizzes') return map.Quizzes;
  if (lower === 'questions') return map.Questions;
  if (lower === 'users') return map.Users;
  throw new Error('Unknown entity: ' + e);
}

function _lhIsActive_(v){
  if (v === undefined || v === null || v === '') return true; // default active
  const s = String(v).trim().toLowerCase();
  return (s === 'true' || s === '1' || s === 'yes' || s === 'y');
}

function _lhReadTable_(ss, sheetName){
  const sh = ss.getSheetByName(sheetName);
  if (!sh) return [];
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];
  const headers = sh.getRange(1,1,1,lastCol).getValues()[0].map(h => String(h||'').trim());
  const values = sh.getRange(2,1,lastRow-1,lastCol).getValues();
  const out = [];
  for (let r=0; r<values.length; r++){
    const row = {};
    for (let c=0; c<headers.length; c++){
      const key = headers[c];
      if (!key) continue;
      row[key] = values[r][c];
    }
    out.push(row);
  }
  return out;
}

function _lhFindById_(rows, idKey, idVal){
  const target = String(idVal||'').trim();
  for (let i=0; i<rows.length; i++){
    if (String(rows[i][idKey]||'').trim() === target) return rows[i];
  }
  return null;
}

function _lhDomains_(ss){
  const rows = _lhReadTable_(ss, 'Domains');
  return rows.filter(r => _lhIsActive_(r.isActive));
}

function _lhModules_(ss, domainId){
  const rows = _lhReadTable_(ss, 'Modules').filter(r => _lhIsActive_(r.isActive));
  if (domainId) return rows.filter(r => String(r.domainId||'') === String(domainId));
  return rows;
}

function _lhCourses_(ss, filters){
  const rows = _lhReadTable_(ss, 'Courses').filter(r => _lhIsActive_(r.isActive));
  const d = filters && filters.domainId ? String(filters.domainId) : '';
  const m = filters && filters.moduleId ? String(filters.moduleId) : '';
  return rows.filter(r => (!d || String(r.domainId||'')===d) && (!m || String(r.moduleId||'')===m));
}

function _lhCourse_(ss, courseId){
  const rows = _lhReadTable_(ss, 'Courses').filter(r => _lhIsActive_(r.isActive));
  return _lhFindById_(rows, 'courseId', courseId);
}

function _lhLessons_(ss, courseId){
  const rows = _lhReadTable_(ss, 'Lessons');
  if (courseId) return rows.filter(r => String(r.courseId||'') === String(courseId));
  return rows;
}

function _lhLesson_(ss, lessonId){
  const rows = _lhReadTable_(ss, 'Lessons');
  return _lhFindById_(rows, 'lessonId', lessonId);
}

function _lhQuiz_(ss, lessonId){
  const quizzes = _lhReadTable_(ss, 'Quizzes');
  const quiz = quizzes.find(q => String(q.lessonId||'') === String(lessonId)) || null;
  if (!quiz) return { quiz: null, questions: [] };
  const questions = _lhReadTable_(ss, 'Questions').filter(q => String(q.quizId||'') === String(quiz.quizId||''));
  return { quiz: quiz, questions: questions };
}

function _lhSearch_(ss, q, limit){
  const query = String(q||'').trim().toLowerCase();
  const lim = Math.max(1, Math.min(Number(limit||20) || 20, 50));
  if (!query) return { domains:[], modules:[], courses:[], lessons:[] };

  function matchAny_(obj, keys){
    for (let i=0; i<keys.length; i++){
      const v = obj[keys[i]];
      if (v && String(v).toLowerCase().indexOf(query) !== -1) return true;
    }
    return false;
  }

  const domains = _lhDomains_(ss).filter(d => matchAny_(d, ['domainId','name_fr','name_en','name_ar','description_fr','description_en','description_ar'])).slice(0, lim);
  const modules = _lhModules_(ss, '').filter(m => matchAny_(m, ['moduleId','domainId','title_fr','title_en','title_ar','description_fr','description_en','description_ar'])).slice(0, lim);
  const courses = _lhCourses_(ss, {}).filter(c => matchAny_(c, ['courseId','domainId','moduleId','title_fr','title_en','title_ar','description_fr','description_en','description_ar','level'])).slice(0, lim);
  const lessons = _lhLessons_(ss, '').filter(l => matchAny_(l, ['lessonId','courseId','title_fr','title_en','title_ar','contentHtml_fr','contentHtml_en','contentHtml_ar'])).slice(0, lim);

  return { domains: domains, modules: modules, courses: courses, lessons: lessons };
}

function _lhDataHealth_(ss){
  // Minimal but useful diagnostic for required tabs/headers + duplicate IDs.
  const required = {
    'Domains':   { req:['domainId','name_fr','name_en','name_ar'],            opt:['description_fr','description_en','description_ar','isActive'] },
    'Modules':   { req:['moduleId','domainId','title_fr','title_en','title_ar'], opt:['description_fr','description_en','description_ar','isActive'] },
    'Courses':   { req:['courseId','domainId','moduleId','title_fr','title_en','title_ar'], opt:['description_fr','description_en','description_ar','level','duration','isActive'] },
    'Lessons':   { req:['lessonId','courseId','title_fr','title_en','title_ar'], opt:['contentHtml_fr','contentHtml_en','contentHtml_ar','resources_fr','resources_en','resources_ar'] },
    'Quizzes':   { req:['quizId','lessonId'],                                opt:['title_fr','title_en','title_ar'] },
    'Questions': { req:['questionId','quizId','correctIndex'],              opt:['type','question_fr','question_en','question_ar','choices_fr','choices_en','choices_ar','explanation_fr','explanation_en','explanation_ar'] },
    'Users':     { req:['userId','email','role','passwordHash','verified'],    opt:['firstName','lastName','verifyCode','verifyExpiresAt','resetRequestedAt','resetCode','resetExpiresAt','createdAt'] }
  };

  function getHeaders_(sh){
    const lastCol = sh.getLastColumn();
    if (!lastCol) return [];
    return sh.getRange(1,1,1,lastCol).getValues()[0].map(function(h){ return String(h||'').trim(); }).filter(function(h){ return !!h; });
  }

  function findDuplicates_(values){
    const seen = {};
    const dups = {};
    for (var i=0; i<values.length; i++){
      var v = String(values[i]||'').trim();
      if (!v) continue;
      if (seen[v]) dups[v] = true;
      else seen[v] = true;
    }
    return Object.keys(dups);
  }

  var sheets = {};
  var checks = [];
  var ok = true;

  Object.keys(required).forEach(function(name){
    var spec = required[name];
    var sh = ss.getSheetByName(name);
    if (!sh){
      sheets[name] = { exists:false, missingHeaders: spec.req.slice() };
      checks.push({ code:'SHEET_MISSING', level:'err', message:'Missing sheet: ' + name });
      ok = false;
      return;
    }

    var headers = getHeaders_(sh);
    var missingReq = spec.req.filter(function(h){ return headers.indexOf(h) === -1; });
    var missingOpt = (spec.opt||[]).filter(function(h){ return headers.indexOf(h) === -1; });

    sheets[name] = { exists:true, missingHeaders: missingReq, optionalMissing: missingOpt };

    if (missingReq.length){
      checks.push({ code:'MISSING_HEADERS', level:'err', message:'Missing required headers in ' + name + ': ' + missingReq.join(', ') });
      ok = false;
    }
    if (missingOpt.length){
      checks.push({ code:'OPTIONAL_HEADERS_MISSING', level:'warn', message:'Optional headers missing in ' + name + ': ' + missingOpt.join(', ') });
    }

    // Duplicate IDs
    try{
      var meta = _lhMeta_(name);
      var idKey = meta.idKey;
      var idCol = headers.indexOf(idKey) + 1;
      if (idCol > 0){
        var lastRow = sh.getLastRow();
        if (lastRow >= 2){
          var vals = sh.getRange(2, idCol, lastRow-1, 1).getValues().map(function(r){ return r[0]; });
          var dups = findDuplicates_(vals);
          if (dups.length){
            checks.push({ code:'DUPLICATE_ID', level:'err', message:'Duplicate ID in ' + name + ': ' + dups.join(', ') });
            ok = false;
          }
        }
      }
    } catch(e){
      // ignore
    }
  });

  // Counts
  var d = _lhReadTable_(ss,'Domains').length;
  var m = _lhReadTable_(ss,'Modules').length;
  var c = _lhReadTable_(ss,'Courses').length;
  var l = _lhReadTable_(ss,'Lessons').length;
  var q = _lhReadTable_(ss,'Quizzes').length;
  var qs = _lhReadTable_(ss,'Questions').length;

  var summaryNotes = [ ok ? 'All core checks passed.' : 'Some checks failed.' ];

  return { ok: ok, sheets: sheets, checks: checks, counts:{ domains:d, modules:m, courses:c, lessons:l, quizzes:q, questions:qs }, summaryNotes: summaryNotes };
}

/** Generic UPSERT for authoring (action=upsert&entity=Domains|Modules|...) */
function upsert_(params){
  const meta = _lhMeta_(params.entity);
  const ss = getSpreadsheet_(params);
  const sh = ss.getSheetByName(meta.sheet);
  if (!sh) throw new Error('Missing sheet: ' + meta.sheet);

  const lastCol = sh.getLastColumn();
  const headers = sh.getRange(1,1,1,lastCol).getValues()[0].map(h => String(h||'').trim());
  const idKey = meta.idKey;

  const obj = (params && params.obj) ? (typeof params.obj === 'string' ? JSON.parse(params.obj) : params.obj) : {};
  const idVal = String(obj[idKey] || params.id || '').trim() || (idKey + '-' + Utilities.getUuid().slice(0,8));

  // find row
  const idCol = headers.indexOf(idKey) + 1;
  if (idCol <= 0) throw new Error('Missing header ' + idKey + ' in ' + meta.sheet);

  const lastRow = sh.getLastRow();
  let rowIndex = -1;
  if (lastRow >= 2){
    const colVals = sh.getRange(2, idCol, lastRow-1, 1).getValues();
    for (let i=0; i<colVals.length; i++){
      if (String(colVals[i][0]||'').trim() === idVal){ rowIndex = i + 2; break; }
    }
  }

  function setCell_(r, key, value){
    const c = headers.indexOf(key) + 1;
    if (c <= 0) return; // ignore unknown fields
    sh.getRange(r,c).setValue(value === undefined || value === null ? '' : value);
  }

  obj[idKey] = idVal;

  if (rowIndex === -1){
    // insert
    const newRow = headers.map(h => (h in obj) ? obj[h] : '');
    sh.appendRow(newRow);
    return { ok:true, entity: meta.sheet, mode:'insert', id: idVal };
  }

  // update only provided keys
  Object.keys(obj).forEach(k => setCell_(rowIndex, k, obj[k]));
  return { ok:true, entity: meta.sheet, mode:'update', id: idVal };
}

/** Override buggy delete_ with a stable implementation */
function delete_(params){
  const meta = _lhMeta_(params.entity);
  const ss = getSpreadsheet_(params);
  const sh = ss.getSheetByName(meta.sheet);
  if (!sh) throw new Error('Missing sheet: ' + meta.sheet);

  const lastCol = sh.getLastColumn();
  const headers = sh.getRange(1,1,1,lastCol).getValues()[0].map(h => String(h||'').trim());
  const idCol = headers.indexOf(meta.idKey) + 1;
  if (idCol <= 0) throw new Error('Missing header ' + meta.idKey + ' in ' + meta.sheet);

  const idVal = String(params.id || '').trim();
  if (!idVal) throw new Error('Missing id');

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return { ok:true, entity: meta.sheet, mode:'noop', id: idVal };

  const colVals = sh.getRange(2, idCol, lastRow-1, 1).getValues();
  for (let i=0; i<colVals.length; i++){
    if (String(colVals[i][0]||'').trim() === idVal){
      sh.deleteRow(i+2);
      return { ok:true, entity: meta.sheet, mode:'delete', id: idVal };
    }
  }
  return { ok:true, entity: meta.sheet, mode:'not_found', id: idVal };
}

/** Override route_ to include missing content endpoints */
function route_(action, params) {
  const ss = getSpreadsheet_(params);

  const PUBLIC = {
    'platformSettings': true,
    'authRegister': true,
    'authLogin': true,
    'authMe': true,
    'authVerifyCode': true,
    'authForgotPassword': true,
    'authResetPassword': true
  };

  const ADMIN = {
    'upsert': true,
    'delete': true,
    'dataHealth': true,
    'adminUsersList': true,
    'adminUpdateUserRole': true,
    'adminCreateUser': true,
    'adminAlerts': true,
    'adminRegenerateVerifyCode': true,
    'adminRegenerateResetCode': true,
    'adminClearResetRequest': true
  };

  if (!PUBLIC[action]) {
    const auth = requireAuth_(ss, params);
    if (auth && auth.error) return auth;
    if (auth && auth.user && auth.user.verified === false) return { error: 'EMAIL_NOT_VERIFIED' };
    if (ADMIN[action] && auth.role !== 'admin') return { error: 'FORBIDDEN' };
    params._auth = auth;
  }

  switch (action) {
    case 'platformSettings': return platformSettings_(params);

    // --- AUTH ---
    case 'authRegister': return authRegister_(params);
    case 'authLogin': return authLogin_(params);
    case 'authMe': return authMe_(params);
    case 'authVerifyCode': return authVerifyCode_(params);
    case 'authForgotPassword': return authForgotPassword_(params);
    case 'authResetPassword': return authResetPassword_(params);

    // --- CONTENT ---
    case 'domains': return { domains: _lhDomains_(ss) };
    case 'modules': return { modules: _lhModules_(ss, params.domainId || '') };
    case 'courses': return { courses: _lhCourses_(ss, { domainId: params.domainId||'', moduleId: params.moduleId||'' }) };
    case 'course': return { course: _lhCourse_(ss, params.courseId) };
    case 'lessons': return { lessons: _lhLessons_(ss, params.courseId || '') };
    case 'lesson': return { lesson: _lhLesson_(ss, params.lessonId) };
    case 'quiz': return _lhQuiz_(ss, params.lessonId);
    case 'search': return _lhSearch_(ss, params.q || '', params.limit || 20);
    case 'dataHealth': return _lhDataHealth_(ss);

    // --- ADMIN ---
    case 'upsert': return upsert_(params);
    case 'delete': return delete_(params);

    case 'adminUsersList': return adminUsersList_(params);
    case 'adminUpdateUserRole': return adminUpdateUserRole_(params);
    case 'adminCreateUser': return adminCreateUser_(params);
    case 'adminAlerts': return adminAlerts_(params);
    case 'adminRegenerateVerifyCode': return adminRegenerateVerifyCode_(params);
    case 'adminRegenerateResetCode': return adminRegenerateResetCode_(params);
    case 'adminClearResetRequest': return adminClearResetRequest_(params);

    // telegram debug disabled

    default:
      return { error: 'UNKNOWN_ACTION', action: action };
  }
}



/**
 * Telegram diagnostics: returns details for token/chatId + Telegram API responses.
 */

/**
 * Telegram quick test: sends a short message to the configured chat and returns result (admin only).
 */




function requireAdmin_(params){
  const s = authSessionFromToken_(params && params.token);
  if (!s || s.role !== 'admin') throw new Error('ADMIN_ONLY');
}