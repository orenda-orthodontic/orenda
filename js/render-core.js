// render-core.js — نقطة الرندر الرئيسية + مركز التنبيهات
// ============ RENDER ROOT ============
function renderFatalErrorScreen(err){
  console.error('fatal render/boot error', err);
  const app = document.getElementById('app');
  if(!app) return;
  app.innerHTML = `
    <div class="empty-state" style="padding:40px 16px;">
      <div style="font-size:16px;font-weight:700;margin-bottom:8px;">تعذر تحميل النظام</div>
      <div style="color:var(--muted);margin-bottom:18px;">حصلت مشكلة أثناء الاتصال أو تحميل البيانات. تأكد إن النت شغال وحاول تاني.</div>
      <div class="row" style="justify-content:center;gap:10px;">
        <button id="fatalRetryBtn">حاول تاني</button>
        <button class="secondary" id="fatalLoginBtn">ارجع لشاشة الدخول</button>
      </div>
    </div>
  `;
  document.getElementById('fatalRetryBtn').onclick = () => location.reload();
  document.getElementById('fatalLoginBtn').onclick = () => supabaseLogout();
}

// ============ NOTIFICATION CENTER (in-app alerts, dismissible) ============
// gathers everything currently alert-worthy across the app. Each alert has a stable `key` and a
// `signature` — dismissing stores key->signature, so the same alert re-appears if the underlying
// value changes (item goes low again, missed-months count goes up, a new visit date comes due).
function computeActiveAlerts(){
  const alerts = [];
  (state.inventory||[]).forEach(item=>{
    if(isLowStockItem(item)){
      const qty = parseFloat(item.qty)||0;
      alerts.push({ key: 'lowstock:' + item.id, signature: String(qty), label: `📦 ${item.name} وصل لحد الإنذار (${qty})` });
    }
  });
  (state.clinics||[]).forEach(c=>{
    clinicUpcomingVisits(c).filter(v=>v.daysUntil<=2).forEach(v=>{
      alerts.push({ key: 'clinicvisit:' + c.id + ':' + v.schedule.id + ':' + v.date, signature: v.date, label: `📅 ميعاد عيادة ${c.name} ${v.daysUntil<=0?'النهاردة':'بعد ' + v.daysUntil + ' يوم'} (${formatDateAr(v.date)})` });
    });
  });
  // Global — scanned across every clinic at boot (scanAllClinicsForAlerts), not just the one
  // currently open, so a case turning a year old in a clinic you haven't opened this session
  // still shows up here.
  (state.globalMissedAlerts||[]).forEach(a=>{
    alerts.push({ key: 'missed:' + a.patientId, signature: String(a.missed), label: `⚠ ${a.name} — ${a.clinicName} مجاش من ${a.missed} شهر` });
  });
  (state.globalUnpaidAlerts||[]).forEach(a=>{
    alerts.push({ key: 'unpaid:' + a.patientId, signature: String(a.unpaid), label: `💰 ${a.name} — ${a.clinicName} مدفعش من ${a.unpaid} شهر` });
  });
  (state.globalCaseAlerts||[]).forEach(a=>{
    if(a.oneYear){
      alerts.push({ key: 'oneyear:' + a.patientId, signature: String(a.months), label: `🎂 ${a.name} — ${a.clinicName} كمّل سنة في العلاج — يستاهل مراجعة` });
    }
    if(a.longDuration){
      alerts.push({ key: 'longcase:' + a.patientId, signature: String(a.months), label: `⏳ ${a.name} — ${a.clinicName} قاعد في العلاج من ${a.months} شهر (أكتر من سنة ونص)` });
    }
  });
  return alerts;
}
function isAlertDismissed(a){
  return state.dismissedAlerts && state.dismissedAlerts[a.key] === a.signature;
}
function activeUndismissedAlerts(){
  return computeActiveAlerts().filter(a=>!isAlertDismissed(a));
}
async function dismissAlert(key, signature){
  if(!state.dismissedAlerts) state.dismissedAlerts = {};
  state.dismissedAlerts[key] = signature;
  await setData('dismissedAlerts', state.dismissedAlerts);
}
// shared fixed container for the top-left utility buttons (خروج / سجل العمليات / بحث / جرس) —
// one flex-wrap row instead of four separately hand-positioned buttons, so they can never
// overlap each other on a narrow screen (see .app-util-bar in the CSS).
function ensureUtilityBar(){
  let bar = document.getElementById('appUtilityBar');
  if(!bar){
    bar = document.createElement('div');
    bar.id = 'appUtilityBar';
    bar.className = 'app-util-bar';
    document.body.appendChild(bar);
  }
  return bar;
}

function ensureNotificationBell(){
  let btn = document.getElementById('globalNotifBtn');
  if(!btn){
    btn = document.createElement('button');
    btn.id = 'globalNotifBtn';
    btn.className = 'secondary small';
    btn.onclick = () => openNotificationsModal();
    ensureUtilityBar().appendChild(btn);
  }
  const alerts = activeUndismissedAlerts();
  btn.textContent = alerts.length ? `🔔 (${alerts.length})` : '🔔';
  btn.classList.toggle('stock-alert-blink', alerts.length > 0);
}
function openNotificationsModal(){
  const existing = document.getElementById('notifModalBg');
  if(existing) existing.remove();
  const alerts = activeUndismissedAlerts();
  const bodyHtml = alerts.length ? alerts.map(a=>`
    <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:8px;gap:8px;">
      <span style="font-size:13px;">${escapeHtml(a.label)}</span>
      <button class="secondary small" data-dismiss-alert="${a.key}" data-dismiss-sig="${escapeHtml(a.signature)}">إلغاء</button>
    </div>
  `).join('') : `<div class="placeholder">مفيش تنبيهات دلوقتي</div>`;
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.id = 'notifModalBg';
  bg.innerHTML = `
    <div class="modal">
      <h3>التنبيهات</h3>
      <div id="notifListBody">${bodyHtml}</div>
      <div class="modal-actions">
        <button id="closeNotifModalBtn">تمام</button>
      </div>
    </div>
  `;
  document.body.appendChild(bg);
  bg.onclick = (e) => { if(e.target === bg) bg.remove(); };
  document.getElementById('closeNotifModalBtn').onclick = () => bg.remove();
  bg.querySelectorAll('[data-dismiss-alert]').forEach(el=>{
    el.onclick = async () => {
      await dismissAlert(el.dataset.dismissAlert, el.dataset.dismissSig);
      ensureNotificationBell();
      bg.remove();
      openNotificationsModal();
    };
  });
}

// ============ GLOBAL SEARCH (Ctrl+K) — V2.8 ============
// Lightweight command palette: jump straight to any clinic or patient by name, or run a couple
// of quick actions, without drilling through Clinics -> Patients -> tabs first.
// state.globalPatientsIndex ({id,name,clinicId,clinicName}) is built once at boot alongside the
// alert scan (scanAllClinicsForAlerts, clinic-features.js) — reuses that same per-clinic patients
// fetch instead of doing a second one here.
function ensureGlobalSearchButton(){
  let btn = document.getElementById('globalSearchBtn');
  if(!btn){
    btn = document.createElement('button');
    btn.id = 'globalSearchBtn';
    btn.className = 'secondary small';
    btn.textContent = '🔍 بحث';
    btn.title = 'بحث سريع (Ctrl+K)';
    btn.onclick = () => openGlobalSearchModal();
    ensureUtilityBar().appendChild(btn);
  }
}

// quick actions the palette can run with no clinic/patient selected — "+ New Visit / Payment /
// Note" from the V2.8 mock need a specific patient already open, so those stay as the existing
// per-patient buttons instead of living here.
function globalSearchQuickActions(){
  return [
    { icon:'🏥', label:'+ عيادة جديدة', run: () => { closeGlobalSearchModal(); openClinicModal(); } },
    { icon:'📦', label:'المخزون (كل العيادات)', run: async () => { closeGlobalSearchModal(); await loadInventory(); state.view='inventory'; state.inventoryFrom='clinics'; render(); } },
    { icon:'📊', label:'التقارير', run: () => { closeGlobalSearchModal(); state.view='reports'; loadReportsData(); } }
  ];
}

function globalSearchMatches(term){
  const q = (term||'').trim().toLowerCase();
  if(!q) return { clinics: [], patients: [] };
  const clinics = (state.clinics||[]).filter(c => (c.name||'').toLowerCase().includes(q)).slice(0, 5);
  const patients = (state.globalPatientsIndex||[]).filter(p => (p.name||'').toLowerCase().includes(q)).slice(0, 8);
  return { clinics, patients };
}

function renderGlobalSearchResults(term){
  const q = (term||'').trim();
  if(!q){
    return `
      <div class="section-title" style="margin-top:0;">إجراءات سريعة</div>
      ${globalSearchQuickActions().map((a,i) => `<div class="global-search-action" data-action-idx="${i}" style="cursor:pointer;padding:8px 4px;">${a.icon} ${escapeHtml(a.label)}</div>`).join('')}
    `;
  }
  const { clinics, patients } = globalSearchMatches(q);
  if(!clinics.length && !patients.length) return `<div class="placeholder">مفيش نتايج لـ "${escapeHtml(q)}"</div>`;
  return `
    ${clinics.length ? `
      <div class="section-title" style="margin-top:0;">عيادات</div>
      ${clinics.map(c => `<div class="global-search-clinic-row" data-clinic-id="${c.id}" style="cursor:pointer;padding:8px 4px;">🏥 ${escapeHtml(c.name)}</div>`).join('')}
    ` : ''}
    ${patients.length ? `
      <div class="section-title" style="margin-top:${clinics.length ? '14px' : '0'};">مرضى</div>
      ${patients.map(p => `<div class="global-search-patient-row" data-patient-id="${p.id}" data-clinic-id="${p.clinicId}" style="cursor:pointer;padding:8px 4px;">👤 ${escapeHtml(p.name)} <span style="color:var(--muted);font-size:12px;">— ${escapeHtml(p.clinicName)}</span></div>`).join('')}
    ` : ''}
  `;
}

function closeGlobalSearchModal(){
  const bg = document.getElementById('globalSearchModalBg');
  if(bg) bg.remove();
  document.removeEventListener('keydown', globalSearchEscHandler);
}

function globalSearchEscHandler(e){
  if(e.key === 'Escape') closeGlobalSearchModal();
}

function openGlobalSearchModal(){
  closeGlobalSearchModal();
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.id = 'globalSearchModalBg';
  bg.innerHTML = `
    <div class="modal" style="max-width:520px;width:95%;">
      <input type="text" id="globalSearchInput" placeholder="دور على عيادة أو مريض...">
      <div id="globalSearchResults" style="max-height:50vh;overflow-y:auto;margin-top:12px;">${renderGlobalSearchResults('')}</div>
    </div>
  `;
  document.body.appendChild(bg);
  bg.onclick = (e) => { if(e.target === bg) closeGlobalSearchModal(); };
  document.addEventListener('keydown', globalSearchEscHandler);
  const input = document.getElementById('globalSearchInput');
  input.style.cssText = 'width:100%;font-size:15px;padding:10px;';
  input.oninput = () => {
    document.getElementById('globalSearchResults').innerHTML = renderGlobalSearchResults(input.value);
    attachGlobalSearchResultHandlers();
  };
  attachGlobalSearchResultHandlers();
  setTimeout(()=>input.focus(), 30);
}

function attachGlobalSearchResultHandlers(){
  document.querySelectorAll('.global-search-action').forEach(el=>{
    el.onclick = () => { globalSearchQuickActions()[parseInt(el.dataset.actionIdx,10)].run(); };
  });
  document.querySelectorAll('.global-search-clinic-row').forEach(el=>{
    el.onclick = async () => {
      closeGlobalSearchModal();
      state.currentClinicId = el.dataset.clinicId;
      await loadPatients(state.currentClinicId);
      state.view = 'patients';
      state.searchTerm = '';
      state.patientsShowArchived = false;
      state.patientListVisibleCount = PATIENT_LIST_PAGE_SIZE;
      if(!state.clinicSummaryMonth) state.clinicSummaryMonth = currentMonthStr();
      state.clinicSummaryLoading = true;
      render();
      await loadClinicPatientAggregates(state.currentClinicId, state.clinicSummaryMonth);
      render();
    };
  });
  document.querySelectorAll('.global-search-patient-row').forEach(el=>{
    el.onclick = async () => {
      closeGlobalSearchModal();
      state.currentClinicId = el.dataset.clinicId;
      await loadPatients(state.currentClinicId);
      state.currentPatientId = el.dataset.patientId;
      state.activeTab = 'overview';
      state.view = 'patient';
      render();
    };
  });
}

// registered once, globally — Ctrl+K / Cmd+K opens the palette from anywhere, even mid-typing in
// a field (preventDefault stops the browser's own "focus address bar" shortcut from also firing)
function ensureGlobalSearchShortcut(){
  if(document.body.dataset.globalSearchBound) return;
  document.body.dataset.globalSearchBound = '1';
  document.addEventListener('keydown', (e) => {
    const k = (e.key || '').toLowerCase();
    if((e.ctrlKey || e.metaKey) && k === 'k'){
      e.preventDefault();
      openGlobalSearchModal();
    }
  });
}

// ============ TOP NAV BAR (fixed, always visible — العيادات / المخزن / التقارير) ============
function ensureTopNavBar(){
  let bar = document.getElementById('appTopbar');
  if(!bar){
    bar = document.createElement('div');
    bar.id = 'appTopbar';
    bar.className = 'app-topbar';
    document.body.insertBefore(bar, document.body.firstChild);
  }
  const items = [
    { view: 'clinics', label: 'العيادات', active: ['clinics', 'patients', 'patient'].includes(state.view) },
    { view: 'inventory', label: 'المخزن', active: state.view === 'inventory' },
    { view: 'reports', label: 'التقارير', active: state.view === 'reports' },
    { view: 'contentqueue', label: '📸 المحتوى', active: state.view === 'contentqueue' },
  ];
  bar.innerHTML = items.map(it =>
    `<button type="button" class="app-topbar-tab${it.active ? ' active' : ''}" data-nav="${it.view}">${it.label}</button>`
  ).join('');
  bar.querySelectorAll('[data-nav]').forEach(b => {
    b.onclick = async () => {
      const view = b.dataset.nav;
      if(view === state.view) return;
      if(view === 'inventory'){
        await loadInventory();
        state.view = 'inventory';
        state.inventoryFrom = 'topbar';
        render();
      } else if(view === 'reports'){
        state.view = 'reports';
        await loadReportsData();
      } else if(view === 'contentqueue'){
        state.view = 'contentqueue';
        await loadContentQueueData();
      } else {
        state.view = view;
        render();
      }
    };
  });
}

// ============ FOCUS PRESERVATION ACROSS RENDER ============
// render() fully rebuilds app.innerHTML. If it fires while the user is still typing in a
// textarea/input that hasn't been blurred yet (e.g. they tabbed from "upper" to "lower" and
// the "upper" field's keyword-scan save triggered a render before "lower" was blurred), the
// DOM node they're typing into gets destroyed and recreated from the last-SAVED value — silently
// discarding their in-progress keystrokes. This snapshots the active field before render() and
// restores it (value + cursor + focus) after, so concurrent edits in different fields don't
// clobber each other.
function capturePreservedFocus(){
  const el = document.activeElement;
  if(!el || (el.tagName !== 'TEXTAREA' && el.tagName !== 'INPUT')) return null;
  if(!el.className) return null;
  const selectorParts = [el.tagName.toLowerCase(), '.' + el.className.trim().split(/\s+/).join('.')];
  Array.from(el.attributes).filter(a=>a.name.startsWith('data-')).forEach(a=>{
    selectorParts.push(`[${a.name}="${CSS.escape(a.value)}"]`);
  });
  return {
    selector: selectorParts.join(''),
    value: el.value,
    selectionStart: el.selectionStart,
    selectionEnd: el.selectionEnd
  };
}
function restorePreservedFocus(preserved){
  if(!preserved) return;
  const el = document.querySelector(preserved.selector);
  if(!el) return;
  el.value = preserved.value;
  el.focus();
  try{ el.setSelectionRange(preserved.selectionStart, preserved.selectionEnd); }catch(e){}
}

// ============ LAST-LOCATION PERSISTENCE (survive a refresh on the same screen) ============
// saved after every successful render, so a refresh (or the browser/tab reopening) can put the
// user back where they were instead of always dropping them on the Clinics list. Only cheap
// identifiers are stored (view + ids), never the loaded data itself — boot() re-fetches for real.
const LAST_LOCATION_KEY = 'orenda_last_location_v1';
function saveCurrentLocation(){
  try{
    localStorage.setItem(LAST_LOCATION_KEY, JSON.stringify({
      view: state.view,
      currentClinicId: state.currentClinicId || null,
      currentPatientId: state.currentPatientId || null,
      activeTab: state.activeTab || null
    }));
  }catch(e){ /* not critical — worst case a refresh just lands on Clinics like before */ }
}
function loadLastLocation(){
  try{ return JSON.parse(localStorage.getItem(LAST_LOCATION_KEY) || 'null'); }
  catch(e){ return null; }
}

// ============ SWIPE BACK/FORWARD NAVIGATION (mobile) ============
// A lightweight browser-style history stack built on top of the existing view/tab state — no
// changes needed to any existing click handler (clinic tile, patient row, breadcrumbs...):
// every one of them already ends in render(), so trackNavHistory() (called at the end of render()
// below) picks up every real navigation automatically by diffing against the last entry.
let navStack = []; // visited locations, oldest first — current screen is always the last entry
let navForwardStack = []; // "undo of back" — cleared the moment a fresh (non swipe-driven) navigation happens
let _navSuppressTrack = false; // true for the one render() that swipeGoBack/swipeGoForward itself triggers

function navLocationSnapshot(){
  return {
    view: state.view,
    currentClinicId: state.currentClinicId || null,
    currentPatientId: state.currentPatientId || null,
    activeTab: state.activeTab || null
  };
}
function sameNavLocation(a, b){
  return !!a && !!b && a.view===b.view && a.currentClinicId===b.currentClinicId && a.currentPatientId===b.currentPatientId && a.activeTab===b.activeTab;
}
function trackNavHistory(){
  if(_navSuppressTrack){ _navSuppressTrack = false; return; }
  const loc = navLocationSnapshot();
  const last = navStack[navStack.length-1];
  if(sameNavLocation(last, loc)) return; // just a re-render of the same screen, not a real navigation
  navStack.push(loc);
  if(navStack.length > 60) navStack.shift();
  navForwardStack = []; // a genuine new navigation invalidates whatever "forward" was available
}

// Boot can restore straight into a deep screen (the patients list, or a specific patient) with
// no in-session navigation to build a history from — without this, swipe-back would do nothing
// until the person navigated somewhere themselves first. Seeds the parent screens (clinics ->
// patients -> patient) so a swipe back works immediately, matching what actually clicking
// through to get there would have produced. Call once, right after restoreLastLocation() and
// before the first render() (so trackNavHistory() then pushes the real current location on top).
function seedNavHistoryForRestore(){
  navStack = [];
  navForwardStack = [];
  if(state.view === 'patient'){
    navStack.push({ view:'clinics', currentClinicId:null, currentPatientId:null, activeTab:null });
    navStack.push({ view:'patients', currentClinicId:state.currentClinicId, currentPatientId:null, activeTab:null });
  } else if(state.view === 'patients'){
    navStack.push({ view:'clinics', currentClinicId:null, currentPatientId:null, activeTab:null });
  }
}

// shared by boot's restoreLastLocation() (main.js) and the swipe handlers below — moves the app
// to a given {view, currentClinicId, currentPatientId, activeTab} snapshot, loading whatever data
// that screen needs. Returns false (and changes nothing) if the target no longer exists (clinic/
// patient got deleted meanwhile) so the caller can drop it instead of landing on a broken screen.
async function goToLocation(loc){
  if(!loc || !loc.view) return false;
  if(loc.view === 'clinics'){
    state.view = 'clinics';
    return true;
  }
  if(loc.view === 'inventory'){
    await loadInventory();
    state.view = 'inventory';
    return true;
  }
  if(loc.view === 'reports'){
    state.view = 'reports';
    return true;
  }
  if(loc.view === 'contentqueue'){
    state.view = 'contentqueue';
    return true;
  }
  if(loc.view === 'patients'){
    const clinic = state.clinics.find(c=>c.id === loc.currentClinicId);
    if(!clinic) return false;
    state.currentClinicId = loc.currentClinicId;
    await loadPatients(state.currentClinicId);
    state.view = 'patients';
    if(!state.clinicSummaryMonth) state.clinicSummaryMonth = currentMonthStr();
    state.clinicSummaryLoading = true;
    loadClinicPatientAggregates(state.currentClinicId, state.clinicSummaryMonth).then(render).catch(e=>console.error('nav aggregates failed', e));
    return true;
  }
  if(loc.view === 'patient'){
    const clinic = state.clinics.find(c=>c.id === loc.currentClinicId);
    if(!clinic) return false;
    await loadPatients(loc.currentClinicId);
    if(!state.patients.find(p=>p.id === loc.currentPatientId)) return false;
    // Monthly Follow-up (bonding/wire/elastic keyword deductions, bracket-map break charges...)
    // reads directly from state.inventory — landing on the patient screen without ever having
    // visited Clinics/Inventory this session (a boot-time restore, or a swipe straight to a
    // patient) left it at its empty startup default, so any stock deduction made from here
    // either failed silently to find the item, or — far worse — the very next inventory save
    // used the "never read this key" fallback and blindly upserted that empty/stale local copy
    // over whatever was actually on the server, discarding real stock numbers with no warning.
    await loadInventory();
    state.currentClinicId = loc.currentClinicId;
    state.currentPatientId = loc.currentPatientId;
    state.activeTab = loc.activeTab || 'overview';
    state.view = 'patient';
    return true;
  }
  return false;
}

// swipe right-to-left ("رجوع") — one screen back in the history stack
async function swipeGoBack(){
  if(navStack.length < 2) return; // nothing before the current screen
  const current = navStack.pop();
  const target = navStack[navStack.length-1];
  _navSuppressTrack = true;
  const ok = await goToLocation(target);
  if(!ok){
    // the target screen doesn't exist anymore (deleted clinic/patient) — drop it and stay put
    _navSuppressTrack = false;
    return;
  }
  navForwardStack.push(current);
  render();
}
// swipe left-to-right ("قدام") — redo whatever the last swipe-back undid
async function swipeGoForward(){
  if(!navForwardStack.length) return;
  const target = navForwardStack.pop();
  _navSuppressTrack = true;
  const ok = await goToLocation(target);
  if(!ok){ _navSuppressTrack = false; return; }
  navStack.push(target);
  render();
}

// ============ SWIPE GESTURE DETECTION ============
// Registered once, globally. Physical screen direction, independent of the app's RTL layout:
// starting on the right and moving left (dx negative) = "رجوع" (back); the opposite = "قدام" (forward).
let _swipeStartX = null, _swipeStartY = null, _swipeStartTime = 0;
const SWIPE_MIN_DISTANCE = 70; // px — ignore small/accidental drags
const SWIPE_MAX_VERTICAL = 60; // px of vertical drift allowed — otherwise it's a scroll, not a swipe
const SWIPE_MAX_TIME = 600; // ms — a deliberate flick, not a slow drag

function ensureSwipeNavListeners(){
  if(document.body.dataset.swipeNavBound) return;
  document.body.dataset.swipeNavBound = '1';
  document.addEventListener('touchstart', (e) => {
    if(e.touches.length !== 1) return;
    _swipeStartX = e.touches[0].clientX;
    _swipeStartY = e.touches[0].clientY;
    _swipeStartTime = Date.now();
  }, {passive:true});
  document.addEventListener('touchend', (e) => {
    if(_swipeStartX === null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - _swipeStartX;
    const dy = t.clientY - _swipeStartY;
    const dt = Date.now() - _swipeStartTime;
    _swipeStartX = null;
    if(dt > SWIPE_MAX_TIME) return;
    if(Math.abs(dy) > SWIPE_MAX_VERTICAL) return; // vertical scroll, not a horizontal swipe
    if(Math.abs(dx) < SWIPE_MIN_DISTANCE) return;
    // don't hijack a swipe that started on something with its own horizontal gesture (photo
    // lightbox has its own swipe-to-change-photo, and any open modal shouldn't navigate the
    // whole app behind it)
    if(e.target.closest && e.target.closest('.modal-bg, #diagPhotoDock')) return;
    if(dx < 0) swipeGoBack();
    else swipeGoForward();
  }, {passive:true});
}

// ============ FLOATING "BACK TO PATIENT LIST" BUTTON (patient screen only) ============
// Stays fixed on screen regardless of scroll position, so switching to another patient in the
// same clinic doesn't require scrolling all the way back up to tap the clinic breadcrumb first.
function ensureBackToPatientsButton(){
  let btn = document.getElementById('backToPatientsBtn');
  if(state.view !== 'patient'){
    if(btn) btn.remove();
    return;
  }
  if(!btn){
    btn = document.createElement('button');
    btn.id = 'backToPatientsBtn';
    btn.className = 'secondary';
    btn.style.cssText = 'position:fixed;bottom:80px;left:20px;z-index:955;box-shadow:0 2px 10px rgba(0,0,0,.3);'; // 80px, not 20px — the diagnosis tab's own "عرض صور قبل" button already sits at bottom:20px;left:20px
    document.body.appendChild(btn);
  }
  btn.textContent = '👥 قايمة المرضى';
  btn.onclick = async () => {
    state.view = 'patients';
    if(!state.clinicSummaryMonth) state.clinicSummaryMonth = currentMonthStr();
    state.clinicSummaryLoading = true;
    render();
    await loadClinicPatientAggregates(state.currentClinicId, state.clinicSummaryMonth);
    render();
  };
}

async function render(){
  const app = document.getElementById('app');
  const preservedFocus = capturePreservedFocus();
  try{
    if(state.view === 'clinics'){
      await loadInventory();
      app.innerHTML = renderClinicsView();
      attachClinicsHandlers();
    } else if(state.view === 'patients'){
      app.innerHTML = renderPatientsView();
      attachPatientsHandlers();
    } else if(state.view === 'patient'){
      app.innerHTML = await renderPatientView();
      attachPatientHandlers();
    } else if(state.view === 'inventory'){
      app.innerHTML = renderInventoryView();
      attachInventoryHandlers();
    } else if(state.view === 'reports'){
      app.innerHTML = renderReportsView();
      attachReportsHandlers();
    } else if(state.view === 'contentqueue'){
      app.innerHTML = renderContentQueueView();
      attachContentQueueHandlers();
    }
    ensureNotificationBell();
    ensureTopNavBar();
    ensureGlobalSearchButton();
    ensureGlobalSearchShortcut();
    ensureBackToPatientsButton();
    syncDiagPhotoDockVisibility();
    refreshMonthlyHistoryModalIfOpen();
    restorePreservedFocus(preservedFocus);
    saveCurrentLocation();
    trackNavHistory();
    ensureSwipeNavListeners();
  }catch(err){
    renderFatalErrorScreen(err);
  }
}

