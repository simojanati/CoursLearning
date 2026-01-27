import { initI18n, t, getCurrentLang } from './i18n.js';
import { register, isAuthenticated, hasRole } from './auth.js';

function qs(sel){ return document.querySelector(sel); }

function getAppPagesBaseUrl(){
  try {
    const u = new URL(window.location.href);
    const basePath = u.pathname.replace(/\/app\/pages\/.*$/, '/app/pages');
    return u.origin + basePath;
  } catch(e){
    return '';
  }
}

function getParam(name){
  try { return new URL(window.location.href).searchParams.get(name); } catch { return null; }
}

function norm_(s){
  return String(s||'').trim().toLowerCase().replace(/\s+/g,' ');
}

function buildPuzzlePack_(){
  // Smart puzzles: short, deterministic, language-specific answers.
  return {
    fr: [
      { q: "Je suis pris une fois dans « minute », deux fois dans « moment », jamais dans « temps ». Qui suis‑je ?", a: ["m"] },
      { q: "Plus je sèche, plus je deviens mouillé. Qui suis‑je ?", a: ["une serviette","serviette"] },
      { q: "J’ai des clés sans serrures, de l’espace sans pièces, et tu peux entrer sans porte. Qui suis‑je ?", a: ["un clavier","clavier"] },
      { q: "Quel nombre manque ? 2, 3, 5, 8, 12, 17, ___", a: ["23"] , hint:"(+1,+2,+3,+4,+5...)" },
      { q: "On me casse sans me toucher. Qui suis‑je ?", a: ["le silence","silence"] },
      { q: "Si tu me nommes, je disparais. Qui suis‑je ?", a: ["le silence","silence"] },
      { q: "Quel mot devient plus court quand on y ajoute deux lettres ?", a: ["court"] , hint:"jeu de mots" },
      { q: "Combien de côtés a un triangle ? (réponse en chiffre)", a: ["3"] },
      { q: "Je peux être écrit, je peux être parlé, je peux être cassé. Qui suis‑je ?", a: ["une promesse","promesse"] },
      { q: "Quel est le prochain : 1, 4, 9, 16, ___", a: ["25"] },
      {"q": "Quel mot est toujours mal orthographié dans le dictionnaire ?", "a": ["mal orthographié", "mal orthographie", "mal", "mal orthographié"]},
      {"q": "Quel chiffre a autant de lettres que sa valeur ?", "a": ["4", "quatre"]},
      {"q": "Je commence la nuit et je finis le matin. Qui suis-je ?", "a": ["n"]},
      {"q": "Quel est le résultat : (8 ÷ 2) × (2 + 2) ?", "a": ["16"]},

    ],
    en: [
      { q: "I am taken from a mine and shut in a wooden case, never released, yet used by almost everyone. What am I?", a: ["pencil lead","lead","graphite"] },
      { q: "The more you take, the more you leave behind. What are they?", a: ["footsteps","footstep"] },
      { q: "I have keys but no locks, space but no room, you can enter but can’t go outside. What am I?", a: ["keyboard","a keyboard"] },
      { q: "What gets wetter as it dries?", a: ["towel","a towel"] },
      { q: "If you say my name, I disappear. What am I?", a: ["silence"] },
      { q: "Find the missing number: 2, 3, 5, 8, 12, 17, ___", a: ["23"], hint:"(+1,+2,+3,+4,+5...)" },
      { q: "What number is the square of 6?", a: ["36"] },
      { q: "What comes next: 1, 4, 9, 16, ___", a: ["25"] },
      { q: "What has to be broken before you can use it?", a: ["egg","an egg"] },
      { q: "What is always in front of you but can’t be seen?", a: ["future","the future"] },
      {"q": "What comes once in a minute, twice in a moment, but never in a thousand years?", "a": ["m"]},
      {"q": "Which number has the same number of letters as its value?", "a": ["4", "four"]},
      {"q": "I start at night and end in the morning. What am I?", "a": ["n"]},
      {"q": "Solve: (8 / 2) * (2 + 2)", "a": ["16"]},

    ],
    ar: [
      { q: "شي حاجة كتزيد كيصغُر. شنو هو؟", a: ["العمر","l3mr","3mr","l3omar"] },
      { q: "شنو اللي كينشف وكيولي مبلل؟", a: ["منشفة","منشفة الحمام","serviette"] },
      { q: "عندو مفاتيح وما عندوش قفّال، وعندو مساحة وما عندوش غرفة. شنو هو؟", a: ["الكيبورد","لوحة المفاتيح","keyboard"] },
      { q: "إلى سميتيه كيمشي. شنو هو؟", a: ["السكوت","الصمت","silence"] },
      { q: "كمّل المتتالية: 2، 3، 5، 8، 12، 17، ___", a: ["23"], hint:"+1 +2 +3 +4 +5" },
      { q: "شنو اللي خاصو يتكسر باش تستافد منو؟", a: ["البيض","بيضة","egg"] },
      { q: "شنو اللي كتمشي عليه وكتبقى كتخليه لوراك؟", a: ["الخطوات","اثار الاقدام","footsteps"] },
      { q: "شحال من ضلع فالمثلث؟ (بالرقم)", a: ["3"] },
      { q: "شنو اللي ديما قدّامك وما كتشوفوش؟", a: ["المستقبل","future"] },
      { q: "1، 4، 9، 16، ___ (كمّل)", a: ["25"] },
      {"q": "حرف يجي مرة فـ \"دقيقة\" ومرتين فـ \"لحظة\" وما كيجيش فـ \"ألف سنة\". شنو هو؟", "a": ["م"]},
      {"q": "شنو هو العدد اللي عدد حروفو كيساوي قيمتو؟ (بالرقم)", "a": ["4"]},
      {"q": "كنبدأ فالليل وكنسالي فالصباح. شكون أنا؟", "a": ["ن"]},
      {"q": "حلّ: (8 ÷ 2) × (2 + 2)", "a": ["16", "١٦"]},

    ]
  };
}

function pickPuzzle_(pack, lang, usedIdx){
  const arr = pack[lang] || pack.fr;
  const candidates = arr.map((p,i)=>({p,i})).filter(x=>!usedIdx.has(x.i));
  const chosen = (candidates.length ? candidates : arr.map((p,i)=>({p,i})));
  const item = chosen[Math.floor(Math.random()*chosen.length)];
  usedIdx.add(item.i);
  return item.p;
}

function openPuzzleModal_({ email, verifyCode }){
  const lang = (getCurrentLang && getCurrentLang()) || 'fr';
  const pack = buildPuzzlePack_();
  const usedIdx = new Set();

  let attemptsLeft = 3;
  let solved = false;
  let current = pickPuzzle_(pack, lang, usedIdx);

  const elQ = qs('#puzzleQuestion');
  const elA = qs('#puzzleAnswer');
  const elAttempts = qs('#puzzleAttempts');
  const elSol = qs('#puzzleSolution');
  const elErr = qs('#puzzleError');
  const elReveal = qs('#puzzleReveal');
  const elCode = qs('#puzzleCode');
  const elLocked = qs('#puzzleLocked');
  const btnCheck = qs('#btnPuzzleCheck');
  const btnGo = qs('#btnGoVerify');
  const btnCopy = qs('#btnCopyCode');
  // Make it easy to reveal the hidden solution: click selects the text (still transparent unless selected)
  if (elSol) {
    elSol.addEventListener('click', () => {
      try {
        const range = document.createRange();
        range.selectNodeContents(elSol);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      } catch (e) {}
    });
  }



  const setQuestion = () => {
    const hint = current.hint ? ` (${current.hint})` : '';
    elQ.textContent = current.q + hint;
    elAttempts.textContent = t('auth.puzzle.attempts', 'Attempts: {{n}}').replace('{{n}}', String(attemptsLeft));
    if (elSol) elSol.textContent = String((current.a && current.a[0]) || '');
    elA.value = '';
    elA.focus();
  };

  const showError = (msgKey, fallback) => {
    elErr.textContent = t(msgKey, fallback);
    elErr.classList.remove('d-none');
  };

  const clearError = () => {
    elErr.classList.add('d-none');
    elErr.textContent = '';
  };

  const reveal = () => {
    solved = true;
    clearError();
    elLocked.classList.add('d-none');
    elCode.textContent = verifyCode;
    elReveal.classList.remove('d-none');
    btnGo.classList.remove('d-none');
    btnCheck.classList.add('d-none');
  };

  const lockOut = () => {
    clearError();
    elReveal.classList.add('d-none');
    btnCheck.classList.add('d-none');
    btnGo.classList.remove('d-none');
    elLocked.classList.remove('d-none');
  };

  btnCheck?.addEventListener('click', () => {
    clearError();
    const ans = norm_(elA.value);
    const ok = (current.a || []).some(x => norm_(x) === ans);
    if (ok){
      reveal();
      return;
    }
    attemptsLeft -= 1;
    if (attemptsLeft <= 0){
      lockOut();
      return;
    }
    showError('auth.puzzle.wrong', 'Wrong answer. Try another puzzle.');
    current = pickPuzzle_(pack, lang, usedIdx);
    setQuestion();
  });

  elA?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter'){
      e.preventDefault();
      btnCheck?.click();
    }
  });

  btnCopy?.addEventListener('click', async () => {
    try{
      await navigator.clipboard.writeText(String(verifyCode || ''));
      btnCopy.textContent = t('common.copied','Copied');
      setTimeout(()=>{ btnCopy.textContent = t('common.copy','Copy'); }, 1200);
    } catch {}
  });

  btnGo?.addEventListener('click', () => {
    sessionStorage.setItem('lh_verify_email', String(email||''));
    if (solved) sessionStorage.setItem('lh_verify_code', String(verifyCode||''));
    // If not solved, user will be shown pending info
    const qp = solved ? '' : '&pending=1';
    window.location.href = `./verify.html?email=${encodeURIComponent(email||'')}${qp}`;
  });

  // Reset UI
  elReveal.classList.add('d-none');
  elLocked.classList.add('d-none');
  btnGo.classList.add('d-none');
  btnCheck.classList.remove('d-none');
  btnCopy.textContent = t('common.copy','Copy');

  setQuestion();

  // Show bootstrap modal
  const modalEl = document.getElementById('puzzleModal');
  // eslint-disable-next-line no-undef
  const modal = new bootstrap.Modal(modalEl, { backdrop: 'static', keyboard: false });
  modal.show();
}

async function init(){
  await initI18n();

  if (isAuthenticated() && (hasRole('student','admin'))){
    const rt = getParam('returnTo');
    window.location.href = rt ? `./${rt}` : './home.html';
    return;
  }

  const form = qs('#registerForm');
  const err = qs('#errBox');
  const btn = qs('#btnRegister');
  const sp = qs('#registerSpinner');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.classList.add('d-none');

    const password = qs('#password').value;
    const password2 = qs('#password2').value;
    if (password !== password2){
      err.textContent = t('auth.err.passwordMismatch','Passwords do not match');
      err.classList.remove('d-none');
      return;
    }

    const payload = {
      firstName: qs('#firstName').value.trim(),
      lastName: qs('#lastName').value.trim(),
      email: qs('#email').value.trim(),
      password
    };

    try {
      if (btn) btn.disabled = true;
      if (sp) sp.classList.remove('d-none');

      const res = await register({ ...payload, appBaseUrl: getAppPagesBaseUrl() });

      // Expect verifyCode in response (revealed only after puzzle)
      const verifyCode = res?.verifyCode || res?.code || '';
      openPuzzleModal_({ email: payload.email, verifyCode });

    } catch (ex){
      err.textContent = String(ex?.message || ex || 'Register failed');
      err.classList.remove('d-none');
    } finally {
      if (btn) btn.disabled = false;
      if (sp) sp.classList.add('d-none');
    }
  });
}

init();