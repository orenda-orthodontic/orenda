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
function queuePendingWrite(key, value, undoTs){
  const map = loadPendingWrites();
  map[key] = { value, queuedAt: new Date().toISOString(), undoTs: undoTs || null };
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
        if(e && e.name === 'ConcurrencyConflictError'){
          // النت رجع، وبان إن جهاز تاني عدّل نفس المفتاح وانت أوفلاين — التعديل المتأخر بتاعك
          // مبقاش ممكن يتبعت فوق تعديل التاني من غير ما يمسحه، فمنسيبوش يحاول للأبد جوّه صامت:
          // نشيله من الطابور (وخطوة التراجع القديمة بتاعته لو موجودة)، نوضح للمستخدم اللي حصل، ونجيب آخر نسخة من السيرفر
          console.error('queued write conflict on', key);
          discardUndoEntry(map[key].undoTs);
          clearPendingWrite(key);
          await handleConcurrencyConflict(key);
          continue;
        }
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
  let undoTs = null;
  try{
    if(!opts.skipUndo) undoTs = recordUndoBeforeWrite(key, value);
    await idbSet(key, JSON.stringify(value));
    _lastKnownValues[key] = value;
    clearPendingWrite(key);
    return true;
  }catch(e){
    if(e && e.name === 'ConcurrencyConflictError'){
      console.error('concurrency conflict on', key);
      discardUndoEntry(undoTs);
      await handleConcurrencyConflict(key);
      return false;
    }
    console.error('storage set failed', key, e);
    // don't lose the change — queue it locally and keep retrying in the background.
    // still remember it as "current" so undo/redo bookkeeping stays consistent even though
    // the remote write hasn't landed yet (the in-memory state already reflects the change).
    _lastKnownValues[key] = value;
    queuePendingWrite(key, value, undoTs);
    toast('مفيش نت دلوقتي — التعديل اتحفظ على الجهاز وهيتبعت لوحده لما النت يرجع');
    return false;
  }
}

// a conflicting shared key means someone else saved in between — the local change is dropped
// (not queued, not retried) and the freshest server copy is pulled in instead, so nothing gets
// silently overwritten. the user has to redo their edit after seeing the up-to-date data.
const CONCURRENCY_KEY_DEFAULTS = { inventory: [], clinics: [], inventoryCategories: [] };
async function handleConcurrencyConflict(key){
  toast('⚠ ' + undoKeyLabel(key) + ' اتعدّل من جهاز تاني في نفس الوقت — تعديلك الأخير اتلغى عشان محدش يمسح التاني. اتحمّلت آخر نسخة، كرر تعديلك تاني.');
  const fresh = await getData(key, CONCURRENCY_KEY_DEFAULTS[key]);
  applyRestoredValueToState(key, fresh);
  if(typeof render === 'function') await render();
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
// a patient file is ONE storage key holding every tab's data together (photos, monthly log,
// diagnosis, bracket map, finance...). Being "in the patient view" isn't specific enough to know
// which tab's edit an undo entry actually belongs to, so we diff the before/after file objects
// and tag the entry with which section(s) of the file actually changed.
const PATIENT_FILE_SECTION_FIELDS = {
  header: ['caseStatus','debondDate','newCaseEvents','caseStartDateOverride','bracketSystem'],
  photos: ['photos'],
  monthly: ['monthlyLog'],
  diagnosis: ['diagnosisSections'],
  brackets: ['bracketMap'],
  stages: ['stageTeeth'],
  finance: ['financeExtras','financeTotal','financePaid','payments']
};
// which of those sections are relevant while looking at each patient tab — 'header' (case
// status/new-case/bracket-system) shows on every tab's header, so it's always included
const PATIENT_TAB_SECTIONS = {
  overview: ['header'],
  diagnosis: ['diagnosis','header'],
  monthly: ['monthly','header'],
  photos: ['photos','header'],
  brackets: ['brackets','monthly','header'],
  stages: ['stages','monthly','header'],
  hygiene: ['monthly','header'],
  finance: ['finance','header']
};
function inferPatientFileSections(prevFile, newFile){
  if(!prevFile || !newFile) return [];
  const changed = [];
  Object.keys(PATIENT_FILE_SECTION_FIELDS).forEach(section=>{
    const fields = PATIENT_FILE_SECTION_FIELDS[section];
    if(fields.some(f => JSON.stringify(prevFile[f]) !== JSON.stringify(newFile[f]))) changed.push(section);
  });
  return changed;
}

function recordUndoBeforeWrite(key, newValue){
  const hasPrev = Object.prototype.hasOwnProperty.call(_lastKnownValues, key);
  if(!hasPrev) return null; // nothing to go back to yet (e.g. very first save of a brand-new key)
  const prev = _lastKnownValues[key];
  if(JSON.stringify(prev) === JSON.stringify(newValue)) return null; // no real change, don't clutter history
  const stack = loadUndoStack();
  const ts = Date.now();
  const entry = { key, prevValue: prev, ts };
  if(key.indexOf('patientfile:') === 0){
    entry.sections = inferPatientFileSections(prev, newValue);
  }
  stack.push(entry);
  while(stack.length > UNDO_STACK_MAX) stack.shift();
  saveUndoStack(stack);
  return ts;
}
// removes a specific undo entry (by the timestamp recordUndoBeforeWrite returned) — used when a
// write turns out to have been rejected (concurrency conflict), so Ctrl+Z can't later "restore"
// a change that was never actually applied, silently clobbering whatever the other device saved
function discardUndoEntry(ts){
  if(!ts) return;
  const stack = loadUndoStack().filter(e => e.ts !== ts);
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
const UNDO_SECTION_LABELS = {
  header: 'بيانات الحالة', photos: 'الصور', monthly: 'المتابعة الشهرية',
  diagnosis: 'التشخيص', brackets: 'خريطة الفصوص', stages: 'مراحل العلاج', finance: 'الحسابات'
};
function undoEntryLabel(entry){
  const base = undoKeyLabel(entry.key);
  if(entry.sections && entry.sections.length){
    const names = entry.sections.map(s => UNDO_SECTION_LABELS[s] || s).join('، ');
    return `${base} (${names})`;
  }
  return base;
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
// which storage keys (and, for a patient file, which section of it) Ctrl+Z should look at first
// depends on what's actually on screen right now — otherwise an unrelated save elsewhere (a
// different tab, a background alert dismissal) could sit on top of the stack and "undo"
// invisibly, making it look like nothing happened (or worse — silently reverting a different
// tab's data, like photos, while you're looking at Monthly Follow-up)
function undoEntryMatchesScreen(entry){
  if(state.view === 'inventory') return entry.key === 'inventory' || entry.key === 'inventoryCategories';
  if(state.view === 'clinics') return entry.key === 'clinics';
  if(state.view === 'patient' && state.currentPatientId){
    if(entry.key !== ('patientfile:' + state.currentPatientId)) return false;
    const relevant = PATIENT_TAB_SECTIONS[state.activeTab];
    if(!relevant) return true; // a tab we don't have a section mapping for — don't over-filter
    if(!entry.sections || !entry.sections.length) return true; // couldn't tell what changed — safer to show it than hide it
    return entry.sections.some(s => relevant.includes(s));
  }
  return true; // no specific screen context (e.g. clinics/patients list) — don't filter
}

let undoing = false;
async function performUndo(){
  if(undoing) return;
  const stack = loadUndoStack();
  if(!stack.length){ toast('مفيش حاجة تترجع'); return; }
  let idx = stack.length - 1;
  while(idx >= 0 && !undoEntryMatchesScreen(stack[idx])) idx--;
  if(idx < 0){ toast('مفيش حاجة تترجع في الشاشة دي'); return; }
  undoing = true;
  try{
    const entry = stack[idx];
    stack.splice(idx, 1);
    saveUndoStack(stack);
    const ok = await setData(entry.key, entry.prevValue, { skipUndo: true });
    if(ok === false){ toast('فشل التراجع — تأكد إن النت شغال'); return; }
    applyRestoredValueToState(entry.key, entry.prevValue);
    if(typeof render === 'function') await render();
    toast('تم التراجع — ' + undoEntryLabel(entry));
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

