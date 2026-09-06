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

async function render(){
  const app = document.getElementById('app');
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
  }catch(err){
    renderFatalErrorScreen(err);
  }
}

