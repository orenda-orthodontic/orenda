// storage.js — تخزين البيانات: Supabase (get/set) + طابور الحفظ Offline لو النت مقطوع

// ============ STORAGE HELPERS (Supabase — synced live across every device) ============
const SUPABASE_URL = 'https://qlojglhddhnslvloqtzz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_cORmYg4chO3LBoukS9Nfiw_9KvNcAy8';
const SUPABASE_REST = SUPABASE_URL + '/rest/v1/kv_store';
const SUPABASE_REST_LOG = SUPABASE_URL + '/rest/v1/activity_log';

function patientNameForLog(){
  const p = state.patients.find(x=>x.id === state.currentPatientId);
  return p ? p.name : (state.currentPatientId || 'مريض غير معروف');
}

// records a "who did what" entry — best-effort, never blocks or breaks the calling action if it fails
async function logActivity(action, description){  try{
    await ensureFreshSession();
    await fetch(SUPABASE_REST_LOG, {
      method: 'POST',
      headers: supabaseHeaders(),
      body: JSON.stringify([{
        actor_email: (authSession && authSession.email) || null,
        action,
        description,
        clinic_id: state.currentClinicId || null,
        patient_id: state.currentPatientId || null
      }])
    });
  }catch(e){
    console.error('logActivity failed', e);
  }
}

async function openActivityLogModal(){
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `
    <div class="modal" style="max-width:640px;">
      <h3>سجل العمليات</h3>
      <div id="activityLogBody" class="placeholder" style="padding:16px;">جارِ التحميل...</div>
      <div class="modal-actions">
        <button class="secondary" id="closeActivityLogBtn">إغلاق</button>
      </div>
    </div>
  `;
  document.body.appendChild(bg);
  document.getElementById('closeActivityLogBtn').onclick = () => bg.remove();
  bg.onclick = (e) => { if(e.target === bg) bg.remove(); };
  try{
    await ensureFreshSession();
    const res = await fetch(SUPABASE_REST_LOG + '?select=*&order=created_at.desc&limit=100', { headers: supabaseHeaders() });
    if(!res.ok) throw new Error('log fetch failed: ' + res.status);
    const rows = await res.json();
    const body = document.getElementById('activityLogBody');
    if(!rows.length){
      body.textContent = 'مفيش عمليات مسجّلة لسه';
    } else {
      body.innerHTML = `
        <table class="diag-table">
          <thead><tr><th>الوقت</th><th>مين</th><th>العملية</th></tr></thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td style="white-space:nowrap;color:var(--muted);font-size:12px;">${new Date(r.created_at).toLocaleString('ar-EG')}</td>
                <td style="white-space:nowrap;">${escapeHtml(r.actor_email || '-')}</td>
                <td>${escapeHtml(r.description || r.action || '')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }
  }catch(e){
    console.error('activity log load failed', e);
    const body = document.getElementById('activityLogBody');
    if(body) body.textContent = 'تعذر تحميل السجل — تأكد إن جدول activity_log اتعمل في Supabase';
  }
}

function supabaseHeaders(extra){
  return Object.assign({
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + (authSession && authSession.access_token ? authSession.access_token : SUPABASE_KEY),
    'Content-Type': 'application/json'
  }, extra || {});
}

// ============ OFFLINE WRITE QUEUE ============
// If a save genuinely fails (no connection, server hiccup that outlasts the retry in idbSet), the
// change is NOT lost: it's kept in localStorage (survives a reload/closed tab) and flushed
// automatically once the connection is back — on the 'online' event, on a periodic timer, and
// once at boot. The in-memory `state` already has the change; this just guarantees it also
// eventually reaches Supabase instead of silently disappearing.
const PENDING_WRITES_KEY = 'orenda_pending_writes_v1';

function loadPendingWrites(){
  try{ return JSON.parse(localStorage.getItem(PENDING_WRITES_KEY) || '{}'); }
  catch(e){ return {}; }
}
function savePendingWritesMap(map){
  try{ localStorage.setItem(PENDING_WRITES_KEY, JSON.stringify(map)); }
  catch(e){ console.error('could not persist pending-writes queue', e); }
}
function queuePendingWrite(key, value){
  const map = loadPendingWrites();
  map[key] = { value, queuedAt: new Date().toISOString() };
  savePendingWritesMap(map);
  updateSyncIndicator();
}
function clearPendingWrite(key){
  const map = loadPendingWrites();
  if(map[key]){ delete map[key]; savePendingWritesMap(map); }
  updateSyncIndicator();
}
function pendingWriteCount(){
  return Object.keys(loadPendingWrites()).length;
}
function updateSyncIndicator(){
  const el = document.getElementById('syncStatus');
  const textEl = document.getElementById('syncStatusText');
  if(!el || !textEl) return;
  const n = pendingWriteCount();
  if(n > 0){
    textEl.textContent = `في ${n} تعديل لسه ما اتزامنش — هيتبعت أوتوماتيك لما النت يرجع`;
    el.classList.add('show');
  } else {
    el.classList.remove('show');
  }
}

let flushingPendingWrites = false;
async function flushPendingWrites(){
  if(flushingPendingWrites) return;
  flushingPendingWrites = true;
  try{
    const map = loadPendingWrites();
    for(const key of Object.keys(map)){
      try{
        await idbSet(key, JSON.stringify(map[key].value));
        clearPendingWrite(key);
      }catch(e){
        console.error('pending-write retry still failing for', key, e);
        // leave it queued — will try again on the next flush
      }
    }
  } finally {
    flushingPendingWrites = false;
  }
}
window.addEventListener('online', flushPendingWrites);
setInterval(()=>{ if(pendingWriteCount() > 0) flushPendingWrites(); }, 20000);

async function setData(key, value, opts){
  opts = opts || {};
  try{
    if(!opts.skipUndo) recordUndoBeforeWrite(key, value);
    await idbSet(key, JSON.stringify(value));
    _lastKnownValues[key] = value;
    clearPendingWrite(key);
    return true;
  }catch(e){
    console.error('storage set failed', key, e);
    // don't lose the change — queue it locally and keep retrying in the background.
    // still remember it as "current" so undo/redo bookkeeping stays consistent even though
    // the remote write hasn't landed yet (the in-memory state already reflects the change).
    _lastKnownValues[key] = value;
    queuePendingWrite(key, value);
    toast('مفيش نت دلوقتي — التعديل اتحفظ على الجهاز وهيتبعت لوحده لما النت يرجع');
    return false;
  }
}

// ============ UNDO (Ctrl+Z) — generic, works anywhere in the app ============
// Every setData() call (every save, anywhere in the system) first pushes the PREVIOUS value of
// that key onto a history stack, before the new value overwrites it — remotely on Supabase and
// locally in state. Pressing Ctrl+Z pops the most recent entry and writes it back, so it works
// even after the "bad" change has already reached Supabase, and pressing it again keeps walking
// further back through the history (multi-level, not just a single toggle).
const UNDO_STACK_KEY = 'orenda_undo_stack_v1';
const UNDO_STACK_MAX = 40;
const _lastKnownValues = {}; // key -> last value we know is currently saved (populated by getData/setData)

function loadUndoStack(){
  try{ return JSON.parse(localStorage.getItem(UNDO_STACK_KEY) || '[]'); }
  catch(e){ return []; }
}
function saveUndoStack(stack){
  try{ localStorage.setItem(UNDO_STACK_KEY, JSON.stringify(stack)); }
  catch(e){ console.error('could not persist undo stack', e); }
}
function recordUndoBeforeWrite(key, newValue){
  const hasPrev = Object.prototype.hasOwnProperty.call(_lastKnownValues, key);
  if(!hasPrev) return; // nothing to go back to yet (e.g. very first save of a brand-new key)
  const prev = _lastKnownValues[key];
  if(JSON.stringify(prev) === JSON.stringify(newValue)) return; // no real change, don't clutter history
  const stack = loadUndoStack();
  stack.push({ key, prevValue: prev, ts: Date.now() });
  while(stack.length > UNDO_STACK_MAX) stack.shift();
  saveUndoStack(stack);
}
function undoKeyLabel(key){
  if(key === 'clinics') return 'العيادات';
  if(key === 'inventory') return 'المخزون';
  if(key === 'inventoryCategories') return 'فئات المخزون';
  if(key === 'dismissedAlerts') return 'التنبيهات';
  if(key.indexOf('patientfile:') === 0) return 'ملف المريض';
  if(key.indexOf('patients:') === 0) return 'قائمة المرضى';
  return 'البيانات';
}
// re-applies a restored value to the in-memory `state` so the screen updates immediately without
// a full reload. Keys that aren't part of the screen currently open are still safely written to
// storage — they just don't need a live UI patch right now.
function applyRestoredValueToState(key, value){
  if(key === 'clinics'){ state.clinics = value || []; }
  else if(key === 'inventory'){ state.inventory = value || []; }
  else if(key === 'inventoryCategories'){ state.inventoryCategories = value || []; }
  else if(key === 'dismissedAlerts'){ state.dismissedAlerts = value || {}; }
  else if(key.indexOf('patientfile:') === 0){
    const patientId = key.slice('patientfile:'.length);
    if(state.currentPatientId === patientId){
      state.currentPatientFile = value;
      if(state.currentPatientFile) state.currentPatientFile._id = patientId;
    }
  } else if(key.indexOf('patients:') === 0){
    const clinicId = key.slice('patients:'.length);
    if(state.currentClinicId === clinicId){ state.patients = value || []; }
  }
}
let undoing = false;
async function performUndo(){
  if(undoing) return;
  const stack = loadUndoStack();
  if(!stack.length){ toast('مفيش حاجة تترجع'); return; }
  undoing = true;
  try{
    const entry = stack.pop();
    saveUndoStack(stack);
    const ok = await setData(entry.key, entry.prevValue, { skipUndo: true });
    if(ok === false){ toast('فشل التراجع — تأكد إن النت شغال'); return; }
    applyRestoredValueToState(entry.key, entry.prevValue);
    if(typeof render === 'function') await render();
    toast('تم التراجع — ' + undoKeyLabel(entry.key));
  } finally {
    undoing = false;
  }
}
document.addEventListener('keydown', (e) => {
  const k = (e.key || '').toLowerCase();
  if((e.ctrlKey || e.metaKey) && k === 'z' && !e.shiftKey){
    e.preventDefault();
    performUndo();
  }
});

