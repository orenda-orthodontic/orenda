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

// re-applies the last screen the user was on before a refresh/reload — reads the lightweight
// pointer saveCurrentLocation() left in localStorage and re-loads whatever data that screen
// actually needs (never trusts stale data, just the "where was I" pointer). Falls back silently
// to the default Clinics view if the referenced clinic/patient was deleted in the meantime.
async function restoreLastLocation(){
  const loc = loadLastLocation();
  if(!loc || !loc.view) return;
  // 'reports' is a heavy analysis screen with its own explicit load step (loadReportsData) —
  // landing there straight from a boot-time restore would just show an empty/stuck screen since
  // nothing triggers that load, so (as before) we deliberately don't restore into it here. Swipe
  // navigation back into it mid-session is fine since its data is still in memory from before.
  if(loc.view === 'reports' || loc.view === 'contentqueue') return;
  await goToLocation(loc);
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
    await restoreLastLocation();
    seedNavHistoryForRestore();
    render();
    attachGlobalLogoutButton();
    await runRothDefaultMigration();
    updateSyncIndicator();
    if(pendingWriteCount() > 0) flushPendingWrites();
    // don't block the initial screen on this — it scans every clinic's patients, then just
    // refreshes the notification bell once it's done
    scanAllClinicsForAlerts().then(ensureNotificationBell).catch(e=>console.error('boot alert scan failed', e));
    maybeRunAutoBackup(); // fire-and-forget — silent daily snapshot, see backup.js
  }catch(err){
    renderFatalErrorScreen(err);
  }
}

function attachGlobalLogoutButton(){
  if(document.getElementById('globalLogoutBtn')) return;
  const bar = ensureUtilityBar(); // shared fixed row — see render-core.js (defined earlier in script load order)
  const btn = document.createElement('button');
  btn.id = 'globalLogoutBtn';
  btn.textContent = 'خروج';
  btn.className = 'secondary small';
  btn.onclick = async () => { if(await confirmModal('تسجيل الخروج؟')) supabaseLogout(); };
  bar.appendChild(btn);

  const logBtn = document.createElement('button');
  logBtn.id = 'globalActivityLogBtn';
  logBtn.textContent = 'سجل العمليات';
  logBtn.className = 'secondary small';
  logBtn.onclick = () => openActivityLogModal();
  bar.appendChild(logBtn);
}

// Undo/Redo have no on-screen buttons — Ctrl+Z / Ctrl+Shift+Z only (see the keydown listener
// below). Removed the visible buttons since the keyboard shortcut covers it and the buttons
// were just taking up space nobody used.

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

// ============ GLOBAL UNDO / REDO SHORTCUTS ============
// Handled here (not inside a specific tab's file) so they work anywhere in the app; the actual
// undo/redo logic and tab-scoping live in storage.js (performUndo/performRedo). Always
// preventDefault on a match — otherwise the browser's own native undo (e.g. inside a focused
// textarea) can fire at the same time as ours and the two fight each other.
document.addEventListener('keydown', (e) => {
  const k = (e.key || '').toLowerCase();
  if(!(e.ctrlKey || e.metaKey)) return;
  if(k === 'z' && !e.shiftKey){
    e.preventDefault();
    performUndo();
  } else if((k === 'z' && e.shiftKey) || k === 'y'){
    e.preventDefault();
    performRedo();
  }
});

updateNetStatus();
boot();
