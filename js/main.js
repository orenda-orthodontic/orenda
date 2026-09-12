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

  if(loc.view === 'inventory'){
    state.view = 'inventory';
    return;
  }

  if(loc.view === 'patients'){
    const clinic = state.clinics.find(c=>c.id === loc.currentClinicId);
    if(!clinic) return; // clinic no longer exists — stay on the default Clinics view
    state.currentClinicId = loc.currentClinicId;
    await loadPatients(state.currentClinicId);
    state.view = 'patients';
    if(!state.clinicSummaryMonth) state.clinicSummaryMonth = currentMonthStr();
    state.clinicSummaryLoading = true;
    // don't block the initial screen on the payments summary — same pattern as the normal
    // clinic-tile click handler (render once immediately after, refresh totals once loaded)
    loadClinicPatientAggregates(state.currentClinicId, state.clinicSummaryMonth).then(render).catch(e=>console.error('restore aggregates failed', e));
    return;
  }

  if(loc.view === 'patient'){
    const clinic = state.clinics.find(c=>c.id === loc.currentClinicId);
    if(!clinic) return;
    await loadPatients(loc.currentClinicId);
    if(!state.patients.find(p=>p.id === loc.currentPatientId)) return; // patient no longer exists there
    state.currentClinicId = loc.currentClinicId;
    state.currentPatientId = loc.currentPatientId;
    state.activeTab = loc.activeTab || 'overview';
    state.view = 'patient';
    return;
  }
  // 'clinics' (the default anyway), or a heavy analysis screen we deliberately don't restore
  // into (its data isn't cheap/safe to silently re-trigger on boot) — nothing else to do
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
    render();
    attachGlobalLogoutButton();
    await runRothDefaultMigration();
    updateSyncIndicator();
    if(pendingWriteCount() > 0) flushPendingWrites();
    // don't block the initial screen on this — it scans every clinic's patients, then just
    // refreshes the notification bell once it's done
    scanAllClinicsForAlerts().then(ensureNotificationBell).catch(e=>console.error('boot alert scan failed', e));
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
