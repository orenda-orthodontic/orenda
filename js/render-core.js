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
function ensureNotificationBell(){
  let btn = document.getElementById('globalNotifBtn');
  if(!btn){
    btn = document.createElement('button');
    btn.id = 'globalNotifBtn';
    btn.className = 'secondary small';
    btn.style.cssText = 'position:fixed;top:10px;left:190px;z-index:999;';
    btn.onclick = () => openNotificationsModal();
    document.body.appendChild(btn);
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

// ============ NAV MENU (hamburger — jump to any main category) ============
function ensureNavMenuButton(){
  let btn = document.getElementById('globalNavBtn');
  if(!btn){
    btn = document.createElement('button');
    btn.id = 'globalNavBtn';
    btn.className = 'nav-menu-toggle';
    btn.setAttribute('aria-label', 'القائمة');
    btn.textContent = '☰';
    btn.onclick = (e) => { e.stopPropagation(); toggleNavMenu(); };
    document.body.appendChild(btn);
  }
}
function toggleNavMenu(){
  const existing = document.getElementById('globalNavMenu');
  if(existing){ existing.remove(); return; }
  const items = [
    { view: 'clinics', label: 'العيادات' },
    { view: 'inventory', label: 'المخزون' },
  ];
  const menu = document.createElement('div');
  menu.id = 'globalNavMenu';
  menu.className = 'nav-menu';
  menu.innerHTML = items.map(it =>
    `<button type="button" class="nav-menu-btn" data-nav="${it.view}">${it.label}</button>`
  ).join('');
  document.body.appendChild(menu);
  menu.querySelectorAll('[data-nav]').forEach(b=>{
    b.onclick = async (e) => {
      e.stopPropagation();
      menu.remove();
      state.view = b.dataset.nav;
      await render();
    };
  });
  setTimeout(() => {
    document.addEventListener('click', function closeOnce(e){
      if(!menu.contains(e.target) && e.target.id !== 'globalNavBtn'){
        menu.remove();
      }
      document.removeEventListener('click', closeOnce);
    }, { once: true });
  }, 0);
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
    } else if(state.view === 'clinicAnalysis'){
      app.innerHTML = renderClinicAnalysisView();
      attachClinicAnalysisHandlers();
    } else if(state.view === 'allClinicsAnalysis'){
      app.innerHTML = renderAllClinicsAnalysisView();
      attachAllClinicsAnalysisHandlers();
    }
    ensureNotificationBell();
    ensureNavMenuButton();
    restorePreservedFocus(preservedFocus);
  }catch(err){
    renderFatalErrorScreen(err);
  }
}

