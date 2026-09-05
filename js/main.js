// main.js — نقطة الدخول: تسجيل الدخول الأولي + مؤشر الاتصال + منع الضغط المزدوج + boot()
// ============ INIT (login gate first) ============
function renderLoginScreen(errorMsg){
  document.getElementById('app').innerHTML = `
    <div style="max-width:340px;margin:70px auto;padding:26px;background:var(--panel);border:1px solid var(--border);border-radius:14px;">
      <h2 style="text-align:center;margin:0 0 18px;">تسجيل الدخول</h2>
      ${errorMsg ? `<div style="color:var(--red);font-size:13px;margin-bottom:12px;text-align:center;">${escapeHtml(errorMsg)}</div>` : ''}
      <div class="field"><label>الإيميل</label><input type="email" id="loginEmail" autocomplete="username"></div>
      <div class="field" style="margin-top:10px;"><label>الباسورد</label><input type="password" id="loginPassword" autocomplete="current-password"></div>
      <button id="loginBtn" style="width:100%;margin-top:18px;">دخول</button>
    </div>
  `;
  const emailEl = document.getElementById('loginEmail');
  const passEl = document.getElementById('loginPassword');
  const btn = document.getElementById('loginBtn');
  const doLogin = async () => {
    const email = emailEl.value.trim();
    const password = passEl.value;
    if(!email || !password){ renderLoginScreen('اكتب الإيميل والباسورد'); return; }
    btn.disabled = true;
    btn.textContent = 'بيدخل...';
    try{
      await supabaseLogin(email, password);
      await boot();
    }catch(e){
      renderLoginScreen(e.message || 'فشل تسجيل الدخول');
    }
  };
  btn.onclick = doLogin;
  passEl.onkeydown = (e) => { if(e.key === 'Enter') doLogin(); };
}

async function boot(){
  try{
    authSession = loadStoredSession();
    const ok = authSession ? await ensureFreshSession() : false;
    if(!ok){
      renderLoginScreen();
      return;
    }
    await loadClinics();
    render();
    attachGlobalLogoutButton();
    await runRothDefaultMigration();
    updateSyncIndicator();
    if(pendingWriteCount() > 0) flushPendingWrites();
  }catch(err){
    renderFatalErrorScreen(err);
  }
}

function attachGlobalLogoutButton(){
  if(document.getElementById('globalLogoutBtn')) return;
  const btn = document.createElement('button');
  btn.id = 'globalLogoutBtn';
  btn.textContent = 'خروج';
  btn.className = 'secondary small';
  btn.style.cssText = 'position:fixed;top:10px;left:10px;z-index:999;';
  btn.onclick = async () => { if(await confirmModal('تسجيل الخروج؟')) supabaseLogout(); };
  document.body.appendChild(btn);

  const logBtn = document.createElement('button');
  logBtn.id = 'globalActivityLogBtn';
  logBtn.textContent = 'سجل العمليات';
  logBtn.className = 'secondary small';
  logBtn.style.cssText = 'position:fixed;top:10px;left:70px;z-index:999;';
  logBtn.onclick = () => openActivityLogModal();
  document.body.appendChild(logBtn);
}

// ============ OFFLINE INDICATOR ============
// navigator.onLine only reflects "does the device have a network interface up",
// not "can we actually reach Supabase" — but combined with the existing
// toast('فشل الحفظ...') in setData() when a request genuinely fails, this gives
// an honest, low-effort signal instead of silence while the person keeps working.
function updateNetStatus(){
  const el = document.getElementById('netStatus');
  if(!el) return;
  el.classList.toggle('show', !navigator.onLine);
}
window.addEventListener('online', updateNetStatus);
window.addEventListener('offline', updateNetStatus);

// ============ GLOBAL DOUBLE-TAP / DOUBLE-SUBMIT GUARD ============
// Applied once, globally, on every button — rather than editing each of the
// ~200 save/delete handlers individually — so a fast double-tap (very common on
// mobile) can't fire the same action twice while the first click is still being
// processed (e.g. still talking to Supabase). Runs in the CAPTURE phase, which
// reaches the button before its own onclick does, so the second click is
// swallowed before it can do anything.
(function(){
  const BUSY_MS = 700; // just long enough to eat an accidental double-tap, short
                        // enough that toggle/expand buttons don't feel laggy
  document.addEventListener('click', function(e){
    const el = e.target.closest('button, .btn');
    if(!el || el.disabled) return;
    if(el.dataset.guardBusy){
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    el.dataset.guardBusy = '1';
    const prevOpacity = el.style.opacity;
    el.style.opacity = '0.55';
    setTimeout(() => {
      delete el.dataset.guardBusy;
      el.style.opacity = prevOpacity;
    }, BUSY_MS);
  }, true);
})();

updateNetStatus();
boot();
