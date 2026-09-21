// backup.js — تصدير/استيراد نسخة احتياطية من كل البيانات
// P0-3: importBackup() بقى فيها: تحقق من schemaVersion، whitelist للمفاتيح المسموح استيرادها،
// رفض صريح لأي مفتاح غير معروف، snapshot تلقائي قبل التنفيذ، ملخص تغييرات (diff) قبل التنفيذ،
// وتسجيل العملية في سجل التدقيق (audit-log.js).

// رقم إصدار شكل ملف الباكاب نفسه — لازم يتزود لو شكل الـ data تغيّر بشكل يكسر التوافق (مفتاح
// جديد إلزامي، تغيير بنية موجودة...) عشان استيراد ملف قديم/من نسخة تانية يترفض بوضوح بدل ما
// يكسر بيانات بصمت.
const BACKUP_SCHEMA_VERSION = 1;

// المفاتيح المسموح استيرادها فقط — أي مفتاح تاني في ملف الباكاب بيتم رفضه صراحة (P0-3) بدل ما
// كان بيتحط في القاعدة كما هو من غير أي فلترة. تحقق بالاسم المضبوط للمفاتيح الثابتة، وبالـ
// prefix للمفاتيح اللي فيها id (ملفات المرضى/قوايم مرضى العيادات). ملاحظة: dailybackup:*،
// preimportsnapshot:*، auditlog:*، lastAutoBackupDate مقصودين خارج الـ whitelist —
// دول بيانات meta عن النظام نفسه ومش المفروض يترجعوا من نسخة قديمة فوق الحالية.
const IMPORT_ALLOWED_EXACT_KEYS = new Set(['clinics', 'inventory', 'inventoryCategories', 'customStageTypes']);
const IMPORT_ALLOWED_PREFIXES = ['patientfile:', 'patients:'];
function isImportAllowedKey(key){
  if(IMPORT_ALLOWED_EXACT_KEYS.has(key)) return true;
  return IMPORT_ALLOWED_PREFIXES.some(p => key.indexOf(p) === 0);
}

// نسخ الباكاب نفسها (dailybackup:* و preimportsnapshot:*) مقصود متدخلش جوه أي نسخة جديدة —
// قبل كده collectAllData كانت بتاخد "كل المفاتيح" فالنسخة بقت بتحتوي على النسخ اللي قبلها (14 نسخة
// جوه نسخة جوه نسخة...) وحجمها كان بيتضاعف كل يوم لحد ما السيرفر بقى يلغيها بـ statement timeout.
const BACKUP_META_PREFIXES = ['dailybackup:', 'preimportsnapshot:'];
function isBackupMetaKey(k){ return BACKUP_META_PREFIXES.some(p => k.indexOf(p) === 0); }

const BATCH_GET_SIZE = 25;        // مفتاح في الطلب الواحد
const BATCH_GET_CONCURRENCY = 4;  // كام طلب بالتوازي

async function fetchOneKeyRaw(key){
  await ensureFreshSession();
  const res = await fetch(SUPABASE_REST + '?key=eq.' + encodeURIComponent(key) + '&select=key,value,updated_at', { headers: supabaseHeaders() });
  if(!res.ok) throw new Error('Supabase get failed: ' + res.status);
  const rows = await res.json();
  return rows[0] || null;
}

// بيجيب قيم كذا مفتاح مرة واحدة (بدل طلب لكل مفتاح). لو طلب دفعة فشل بيحاول كل مفتاح لوحده مرة.
// بيرجع { values: {key: value} (المفاتيح الموجودة بس), failed: [المفاتيح اللي معرفناش نقراها] }.
// trackVersions=true بيسجل updated_at زي idbGet بالظبط (للاستيراد اللي بعده كتابة مشروطة) — النسخ
// الاحتياطي العادي لأ، عشان قراءة النسخة متحدّثش "آخر نسخة شفتها" لملف اتفتح على الشاشة قبلها.
async function fetchKeysBatched(keys, opts){
  opts = opts || {};
  const values = {}, failed = [];
  const batches = [];
  for(let i = 0; i < keys.length; i += BATCH_GET_SIZE) batches.push(keys.slice(i, i + BATCH_GET_SIZE));
  const take = (row) => {
    values[row.key] = row.value;
    if(opts.trackVersions){
      if(isConcurrencyProtectedKey(row.key)) _lastKnownUpdatedAt[row.key] = row.updated_at;
      delete _readFailedKeys[row.key];
    }
  };
  const runBatch = async (batch) => {
    try{
      await ensureFreshSession();
      const inList = batch.map(k => '"' + k.replace(/"/g, '') + '"').join(',');
      const res = await fetch(SUPABASE_REST + '?key=in.(' + encodeURIComponent(inList) + ')&select=key,value,updated_at', { headers: supabaseHeaders() });
      if(!res.ok) throw new Error('batch get failed: ' + res.status);
      (await res.json()).forEach(take);
    }catch(e){
      console.error('batch read failed, retrying keys one by one', e);
      for(const k of batch){
        try{ const row = await fetchOneKeyRaw(k); if(row) take(row); }
        catch(e2){ console.error('single key read failed', k, e2); failed.push(k); }
      }
    }
  };
  let next = 0;
  const workers = Array.from({ length: Math.min(BATCH_GET_CONCURRENCY, batches.length) }, async () => {
    while(next < batches.length){ const b = batches[next++]; await runBatch(b); }
  });
  await Promise.all(workers);
  return { values, failed };
}

// نسخة كاملة من بيانات التطبيق. لو أي مفتاح معرفناش نقراه بترمي error بدل ما تسكت وتطلع نسخة
// ناقصة (قبل كده المفتاح الفاشل كان بيتحط null بصمت والنسخة بتتسمى "ناجحة" وهي ناقصة مرضى).
async function collectAllData(){
  const keys = (await idbListKeys()).filter(k => !isBackupMetaKey(k));
  const { values, failed } = await fetchKeysBatched(keys);
  if(failed.length) throw new Error('تعذر قراءة ' + failed.length + ' مفتاح من السيرفر — النسخة الاحتياطية اتلغت عشان متطلعش ناقصة');
  return values;
}

// ---- تخزين النسخة على أجزاء: صف manifest صغير (نفس اسم المفتاح القديم dailybackup:YYYY-MM-DD)
// + صفوف أجزاء "<المفتاح>:part:N" كل واحد بحجم محدود. صف واحد ضخم هو اللي كان بيتلغي بالـ timeout.
// الـ manifest بيتكتب آخر حاجة — لو الكتابة وقفت في النص النسخة الناقصة مبتظهرش في القايمة أصلًا.
const BACKUP_PART_MAX_CHARS = 400000;
function splitBackupData(data){
  const parts = [];
  let cur = {}, size = 0;
  Object.keys(data).forEach(k => {
    const len = JSON.stringify(data[k]).length + k.length + 8;
    if(size > 0 && size + len > BACKUP_PART_MAX_CHARS){ parts.push(cur); cur = {}; size = 0; }
    cur[k] = data[k];
    size += len;
  });
  if(size > 0 || !parts.length) parts.push(cur);
  return parts;
}
async function setBackupRowWithRetry(key, value){
  for(let attempt = 0; attempt < 3; attempt++){
    if(await setData(key, value, { skipUndo: true })) return true;
    await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
  }
  return false;
}
async function writeChunkedBackup(manifestKey, meta, data){
  const parts = splitBackupData(data);
  const written = [];
  const cleanup = async () => { for(const k of written){ try{ await idbDelete(k); }catch(e){ /* best effort */ } } };
  for(let i = 0; i < parts.length; i++){
    const pk = manifestKey + ':part:' + i;
    if(!(await setBackupRowWithRetry(pk, { data: parts[i] }))){ await cleanup(); return false; }
    written.push(pk);
  }
  const manifest = Object.assign({}, meta, { chunked: true, partKeys: written, keyCount: Object.keys(data).length });
  if(!(await setBackupRowWithRetry(manifestKey, manifest))){ await cleanup(); return false; }
  return true;
}
// بيرجّع الـ payload الكامل ({schemaVersion, exportedAt, data, ...}) سواء النسخة مقسمة أو من الشكل القديم
async function readBackupPayload(key){
  const raw = await idbGet(key);
  if(!raw) return null;
  const payload = JSON.parse(raw);
  if(!payload.chunked) return payload;
  const data = {};
  for(const pk of payload.partKeys){
    const praw = await idbGet(pk);
    if(!praw) throw new Error('جزء ناقص من النسخة: ' + pk);
    Object.assign(data, JSON.parse(praw).data);
  }
  if(payload.keyCount !== undefined && Object.keys(data).length !== payload.keyCount) throw new Error('عدد المفاتيح في النسخة مش مطابق');
  const out = Object.assign({}, payload, { data });
  delete out.chunked; delete out.partKeys; delete out.keyCount;
  return out;
}

// ============ AUTOMATIC DAILY BACKUP (server-side, no download needed) ============
// Unlike exportBackup() (a manual file download), this silently snapshots the whole database
// into its own kv_store row once per real day and keeps a rolling window of recent days — so
// data isn't only ever one bad write away from being unrecoverable, even if the doctor forgets
// to export manually. Runs once at boot, fire-and-forget, never blocks or shows anything unless
// it fails (logged only, not surfaced — a missed auto-backup shouldn't interrupt the workday).
const AUTO_BACKUP_RETENTION_DAYS = 14;
const AUTO_BACKUP_RETRY_COOLDOWN_MS = 30 * 60 * 1000; // لو محاولة فشلت، منكررهاش مع كل ريفرش
async function maybeRunAutoBackup(){
  try{
    const today = todayStr();
    const lastRun = await getData('lastAutoBackupDate', null);
    if(_readFailedKeys['lastAutoBackupDate']) return; // مش قادرين نعرف إحنا عملنا النهاردة ولا لأ — السيرفر تعبان، نسيبها
    if(lastRun === today) return; // already ran today (on this or another device)
    try{
      const lastTry = parseInt(localStorage.getItem('orenda_autobackup_last_try') || '0', 10);
      if(Date.now() - lastTry < AUTO_BACKUP_RETRY_COOLDOWN_MS) return;
      localStorage.setItem('orenda_autobackup_last_try', String(Date.now()));
    }catch(e){ /* localStorage مش متاح — نكمل عادي */ }
    const data = await collectAllData();
    const meta = { schemaVersion: BACKUP_SCHEMA_VERSION, exportedAt: new Date().toISOString(), app: 'Orenda Orthodontic System', auto: true };
    const ok = await writeChunkedBackup('dailybackup:' + today, meta, data);
    if(!ok){ console.error('auto backup could not be written'); return; } // don't mark today as "done"
    await setData('lastAutoBackupDate', today, { skipUndo: true });
    await pruneOldAutoBackups();
  }catch(e){
    console.error('auto backup failed', e); // best-effort — never surfaced to the user
  }
}

// بيمسح النسخ الأقدم من AUTO_BACKUP_RETENTION_DAYS يوم بكل أجزائها (الـ manifest الأول عشان نسخة
// نص ممسوحة متظهرش في القايمة)، وأي أجزاء يتيمة من محاولة فشلت في يوم قديم.
const AUTO_BACKUP_KEY_RE = /^dailybackup:(\d{4}-\d{2}-\d{2})(:part:\d+)?$/;
async function pruneOldAutoBackups(){
  try{
    const keys = await idbListKeys();
    const byDate = {};
    keys.forEach(k => {
      const m = AUTO_BACKUP_KEY_RE.exec(k);
      if(!m) return;
      const d = byDate[m[1]] || (byDate[m[1]] = { manifest: null, parts: [] });
      if(m[2]) d.parts.push(k); else d.manifest = k;
    });
    const today = todayStr();
    const dates = Object.keys(byDate).sort();
    const withManifest = dates.filter(d => byDate[d].manifest);
    const doomed = new Set(withManifest.slice(0, Math.max(0, withManifest.length - AUTO_BACKUP_RETENTION_DAYS)));
    dates.forEach(d => { if(!byDate[d].manifest && d !== today) doomed.add(d); });
    for(const d of doomed){
      const entry = byDate[d];
      for(const k of [entry.manifest].concat(entry.parts)){
        if(!k) continue;
        try{ await idbDelete(k); }catch(e){ console.error('failed to prune old auto backup', k, e); }
      }
    }
  }catch(e){
    console.error('prune old auto backups failed', e);
  }
}

// نسخ الأمان قبل الاستيراد كانت بتتراكم للأبد وكل واحدة نسخة كاملة — بنحتفظ بآخر 5 بس
const PRE_IMPORT_SNAPSHOTS_TO_KEEP = 5;
async function pruneOldImportSnapshots(){
  try{
    const keys = await idbListKeys();
    const byId = {};
    keys.forEach(k => {
      if(k.indexOf('preimportsnapshot:') !== 0) return;
      const m = /^(preimportsnapshot:.+?)(:part:\d+)?$/.exec(k);
      if(!m) return;
      const d = byId[m[1]] || (byId[m[1]] = { manifest: null, parts: [] });
      if(m[2]) d.parts.push(k); else d.manifest = k;
    });
    const ids = Object.keys(byId).filter(id => byId[id].manifest).sort(); // ISO timestamps بترتب زمنيًا
    for(const id of ids.slice(0, Math.max(0, ids.length - PRE_IMPORT_SNAPSHOTS_TO_KEEP))){
      for(const k of [byId[id].manifest].concat(byId[id].parts)){
        try{ await idbDelete(k); }catch(e){ console.error('failed to prune import snapshot', k, e); }
      }
    }
  }catch(e){
    console.error('prune import snapshots failed', e);
  }
}

// لسه بيدور على dailybackup:* فقط (مش على النسخ المأخوذة تلقائيًا قبل استيراد — preimport
// snapshots ليها زرار/قايمة تانية لو احتجتها، مقصود مش يظهروا هنا عشان القايمة دي مخصصة
// للنسخ اليومية العادية بس)
async function listAutoBackups(){
  const keys = await idbListKeys();
  // صفوف الـ manifest بس (dailybackup:YYYY-MM-DD) — الأجزاء (:part:N) مش نسخ لوحدها
  return keys.filter(k => /^dailybackup:\d{4}-\d{2}-\d{2}$/.test(k)).sort().reverse(); // newest first
}
async function downloadAutoBackup(key){
  let payload;
  try{ payload = await readBackupPayload(key); }
  catch(e){ console.error('auto backup read failed', key, e); toast('معرفتش أقرأ النسخة دي كاملة — حاول تاني'); return; }
  if(!payload){ toast('النسخة دي مش موجودة'); return; }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `نسخة-احتياطية-تلقائية-${key.replace('dailybackup:','')}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
async function openAutoBackupsModal(){
  const existing = document.getElementById('autoBackupsModalBg');
  if(existing) existing.remove();
  const keys = await listAutoBackups();
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.id = 'autoBackupsModalBg';
  bg.innerHTML = `
    <div class="modal">
      <h3>النسخ الاحتياطية التلقائية (آخر ${AUTO_BACKUP_RETENTION_DAYS} يوم)</h3>
      ${keys.length ? keys.map(k => `
        <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span style="font-size:13px;">${escapeHtml(formatDateAr(k.replace('dailybackup:','')))}</span>
          <button class="secondary small" data-download-backup="${k}">⬇ تحميل</button>
        </div>
      `).join('') : `<div class="placeholder">لسه مفيش نسخ تلقائية اتعملت</div>`}
      <div class="modal-actions">
        <button id="closeAutoBackupsModalBtn">تمام</button>
      </div>
    </div>
  `;
  document.body.appendChild(bg);
  bg.onclick = (e) => { if(e.target === bg) bg.remove(); };
  document.getElementById('closeAutoBackupsModalBtn').onclick = () => bg.remove();
  bg.querySelectorAll('[data-download-backup]').forEach(el=>{
    el.onclick = () => downloadAutoBackup(el.dataset.downloadBackup);
  });
}

async function exportBackup(){
  toast('بيجهّز الملف...');
  let data;
  try{ data = await collectAllData(); }
  catch(e){ console.error('export failed', e); toast('معرفتش أقرأ كل البيانات من السيرفر — الملف اتلغى عشان مايطلعش ناقص. حاول تاني.'); return; }
  const payload = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    app: 'Orenda Orthodontic System',
    data
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = todayStr();
  a.href = url;
  a.download = `نسخة-احتياطية-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast('اتحمّل الملف');
}

// نسخة أمان كاملة تلقائية قبل أي استيراد — منفصلة عن dailybackup: العادية، عشان لو الاستيراد
// طلع غلط أو الدكتور غيّر رأيه بعد كده يكون فيه رجوع مضمون لظبط البيانات لحظة ما بدأ الاستيراد.
// بترجّع مفتاح النسخة لو اتحفظت كاملة، أو null لو فشلت — والاستيراد بيتوقف في الحالة دي.
async function snapshotBeforeImport(){
  try{
    const data = await collectAllData();
    const key = 'preimportsnapshot:' + new Date().toISOString();
    const meta = { schemaVersion: BACKUP_SCHEMA_VERSION, exportedAt: new Date().toISOString(), app: 'Orenda Orthodontic System', reason: 'pre-import auto snapshot' };
    const ok = await writeChunkedBackup(key, meta, data);
    return ok ? key : null;
  }catch(e){
    console.error('pre-import snapshot failed', e);
    return null;
  }
}

// بيبني ملخص التغييرات المتوقعة للمفاتيح المسموحة (whitelisted) بس، قبل ما يتنفذ أي حاجة فعليًا.
// المقارنة بـ JSON.stringify — كفاية عشان نعرف هيضاف/هيتغير/هيفضل زي ما هو، مفيش داعي لـ diff
// تفصيلي جوه كل ملف مريض دلوقتي.
async function buildImportDiffSummary(data, importKeys){
  const added = [], changed = [], unchanged = [];
  // trackVersions: الكتابة بعد كده بتعتمد على updated_at اللي اتقرا هنا (كتابة مشروطة زي ما كانت)
  const { values, failed } = await fetchKeysBatched(importKeys, { trackVersions: true });
  if(failed.length) throw new Error('تعذر قراءة ' + failed.length + ' مفتاح للمقارنة');
  for(const k of importKeys){
    const current = Object.prototype.hasOwnProperty.call(values, k) ? values[k] : null;
    if(current === null) added.push(k);
    else if(JSON.stringify(current) !== JSON.stringify(data[k])) changed.push(k);
    else unchanged.push(k);
  }
  return { added, changed, unchanged };
}

function showImportDiffModal(diff, rejectedKeys){
  return new Promise(resolve=>{
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    const fmtList = (arr) => arr.length ? arr.map(k=>`<div style="font-size:12px;">${escapeHtml(k)}</div>`).join('') : '<div class="placeholder" style="font-size:12px;">لا يوجد</div>';
    bg.innerHTML = `
      <div class="modal" style="max-width:520px;width:95%;">
        <h3>ملخص الاستيراد قبل التنفيذ</h3>
        <div style="max-height:50vh;overflow-y:auto;">
          <div style="margin-bottom:10px;">
            <div style="font-weight:700;font-size:13px;margin-bottom:4px;">🆕 مفاتيح جديدة (${diff.added.length})</div>
            ${fmtList(diff.added)}
          </div>
          <div style="margin-bottom:10px;">
            <div style="font-weight:700;font-size:13px;margin-bottom:4px;">✏️ هتتغير (${diff.changed.length})</div>
            ${fmtList(diff.changed)}
          </div>
          <div style="margin-bottom:10px;">
            <div style="font-weight:700;font-size:13px;margin-bottom:4px;">⏸ زي ما هي (${diff.unchanged.length})</div>
            ${fmtList(diff.unchanged)}
          </div>
          ${rejectedKeys.length ? `
            <div style="margin-bottom:10px;">
              <div style="font-weight:700;font-size:13px;margin-bottom:4px;color:var(--red);">🚫 مرفوضة — مش من المفاتيح المعروفة، مش هتتستورد (${rejectedKeys.length})</div>
              ${fmtList(rejectedKeys)}
            </div>
          ` : ''}
        </div>
        <div class="modal-actions">
          <button class="secondary" id="importDiffCancelBtn">إلغاء</button>
          <button id="importDiffOkBtn">تنفيذ الاستيراد</button>
        </div>
      </div>
    `;
    document.body.appendChild(bg);
    const cleanup = (result) => { bg.remove(); resolve(result); };
    document.getElementById('importDiffCancelBtn').onclick = () => cleanup(false);
    document.getElementById('importDiffOkBtn').onclick = () => cleanup(true);
    bg.onclick = (e) => { if(e.target === bg) cleanup(false); };
  });
}

async function importBackup(file){
  try{
    const text = await file.text();
    const payload = JSON.parse(text);

    // ---- 1) schemaVersion: رفض واضح لملف من نسخة قديمة/غير متوافقة بدل ما نحاول نستورده
    // ونكسر حاجة بصمت
    if(payload.schemaVersion === undefined){
      await alertModal('الملف ده من نسخة قديمة من البرنامج مفيهاش رقم إصدار (schemaVersion) — الاستيراد اتوقف لحمايتك. لو الملف ده مهم، قوللي عشان نشوف حل يدوي آمن.');
      return;
    }
    if(payload.schemaVersion !== BACKUP_SCHEMA_VERSION){
      await alertModal(`رقم إصدار الملف (${payload.schemaVersion}) مش نفس إصدار البرنامج الحالي (${BACKUP_SCHEMA_VERSION}) — الاستيراد اتوقف عشان منكسرش البيانات.`);
      return;
    }

    const data = payload && payload.data ? payload.data : payload;
    const allKeys = Object.keys(data || {}).filter(k => data[k] !== null && data[k] !== undefined);
    if(!allKeys.length){ toast('الملف فاضي أو مش صالح'); return; }

    // ---- 2) whitelist: نفصل المفاتيح المعروفة عن أي حاجة غريبة قبل ما نلمس أي حاجة في القاعدة
    const importKeys = allKeys.filter(isImportAllowedKey);
    const rejectedKeys = allKeys.filter(k => !isImportAllowedKey(k));
    if(!importKeys.length){
      await alertModal('مفيش أي مفتاح معروف/مسموح في الملف ده — الاستيراد اتوقف.');
      return;
    }

    // ---- 3) ملخص التغييرات قبل أي تنفيذ فعلي
    toast('بيجهّز ملخص الاستيراد...');
    let diff;
    try{ diff = await buildImportDiffSummary(data, importKeys); }
    catch(e){
      console.error('import diff failed', e);
      await alertModal('معرفتش أقرأ البيانات الحالية من السيرفر عشان أقارنها بالملف — الاستيراد اتوقف ومفيش حاجة اتغيرت. حاول تاني.');
      return;
    }
    const proceed = await showImportDiffModal(diff, rejectedKeys);
    if(!proceed) return;

    if(!(await confirmModal('هيتم استبدال بيانات نفس المرضى/العيادات لو موجودين بنفس الأرقام حسب الملخص فوق. متأكد إنك عايز تكمل؟'))) return;

    // ---- 4) snapshot تلقائي قبل التنفيذ الفعلي (رجوع مضمون لو حصل غلط)
    toast('بياخد نسخة أمان قبل الاستيراد...');
    const snapshotKey = await snapshotBeforeImport();
    if(!snapshotKey){
      await alertModal('معرفتش آخد نسخة الأمان قبل الاستيراد — الاستيراد اتوقف ومفيش حاجة اتغيرت، عشان لو حصل غلط مكانش هيبقى فيه رجوع. حاول تاني.');
      return;
    }

    // ---- 5) التنفيذ: المفاتيح المسموحة بس، مع محاولة تانية لأي فشل عابر
    const failed = [];
    for(const k of importKeys){
      const ok = await setData(k, data[k]);
      if(!ok) failed.push(k);
    }
    if(failed.length){
      const stillFailed = [];
      for(const k of failed){
        const ok = await setData(k, data[k]);
        if(!ok) stillFailed.push(k);
      }
      failed.length = 0;
      failed.push(...stillFailed);
    }

    await loadClinics();
    state.view = 'clinics';
    render();

    pruneOldImportSnapshots(); // fire-and-forget — بنحتفظ بآخر 5 نسخ أمان بس

    // ---- 6) تسجيل العملية في سجل التدقيق — سواء نجحت كلها أو فيها فاشل
    await logAuditEvent('backup_import', {
      fileExportedAt: payload.exportedAt || null,
      importedKeys: importKeys.filter(k => !failed.includes(k)),
      failedKeys: failed,
      rejectedKeys,
      preImportSnapshotKey: snapshotKey
    });

    if(failed.length){
      await alertModal('تم استيراد معظم البيانات، لكن الأجزاء دي فشلت في الرفع حتى بعد إعادة المحاولة:\n' + failed.join('\n') + '\n\nتأكد إن النت شغال ومستقر وحاول تستورد نفس الملف تاني.\n\n(في نسخة أمان كاملة محفوظة من قبل الاستيراد لو احتجت ترجع لها).');
    } else {
      toast(rejectedKeys.length ? `اتضافت البيانات المعروفة — واترفض ${rejectedKeys.length} مفتاح غير معروف` : 'اتضافت النسخة الاحتياطية بالكامل');
    }
  }catch(e){
    console.error('import failed', e);
    await logAuditEvent('backup_import_failed', { error: (e && e.message) || String(e) });
    toast('فشل استيراد الملف — تأكد إنه ملف نسخة احتياطية صحيح');
  }
}

function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 1800);
}
