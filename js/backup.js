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
// deletedRevealTeeth / doctorName: بيانات حقيقية بتأثر على شكل المخزون واسم الدكتور — لو اتسابت برة
// الباك أب، استرجاع المخزون كان هيرجّع فصوص المستخدم مسحها بإيده.
// orthoNotes ("ملاحظاتي"): كان ناقص من القايمة دي قبل كده — يعني كان بيتصدّر في النسخة الاحتياطية
// عادي (مش مستبعد)، لكن أي محاولة استرجاع كانت بترفضه كـ"مفتاح غير معروف" ومتضاعش ملاحظات
// الدكتور تاني. لازم يفضل هنا عشان استيراد نسخة قديمة يرجّع الملاحظات فعلاً.
const IMPORT_ALLOWED_EXACT_KEYS = new Set(['clinics', 'inventory', 'inventoryCategories', 'customStageTypes', 'deletedRevealTeeth', 'doctorName', 'orthoNotes']);
const IMPORT_ALLOWED_PREFIXES = ['patientfile:', 'patients:'];
function isImportAllowedKey(key){
  if(IMPORT_ALLOWED_EXACT_KEYS.has(key)) return true;
  return IMPORT_ALLOWED_PREFIXES.some(p => key.indexOf(p) === 0);
}

// مفاتيح الـ meta (نسخ تلقائية، snapshots، سجل تدقيق، علامات تشغيل) — مقصود تتستبعد من أي نسخة
// احتياطية. قبل كده collectAllData كانت بتلمّ كل مفاتيح القاعدة بما فيها dailybackup:* نفسها، فكل
// نسخة يومية كانت بتحتوي جواها كل النسخ اللي قبلها (الحجم بيتضاعف كل يوم: ~2^n) لحد ما الحفظ
// يفشل بصمت. النسخة دلوقتي بتحتوي بس على البيانات الحقيقية اللي الاستيراد أصلاً بيقبلها.
const BACKUP_EXCLUDED_PREFIXES = ['dailybackup:', 'preimportsnapshot:', 'auditlog:'];
const BACKUP_EXCLUDED_EXACT_KEYS = new Set(['lastAutoBackupDate', 'migration_bracket_default_roth', 'dismissedAlerts']);
function isBackupExcludedKey(key){
  if(BACKUP_EXCLUDED_EXACT_KEYS.has(key)) return true;
  return BACKUP_EXCLUDED_PREFIXES.some(p => key.indexOf(p) === 0);
}

// JSON.stringify بترتيب مفاتيح ثابت — Postgres jsonb مبيحافظش على ترتيب المفاتيح، فمقارنة
// stringify عادية بين اللي اتكتب واللي اترجع كانت ممكن تطلع "مختلف" وهو نفس الداتا بالظبط.
function canonicalStringify(v){
  if(v === null || typeof v !== 'object') return JSON.stringify(v);
  if(Array.isArray(v)) return '[' + v.map(canonicalStringify).join(',') + ']';
  return '{' + Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ':' + canonicalStringify(v[k])).join(',') + '}';
}

async function collectAllData(){
  const out = {};
  const keys = (await idbListKeys()).filter(k => !isBackupExcludedKey(k));
  for(const k of keys){
    try{
      const v = await idbGet(k);
      out[k] = v ? JSON.parse(v) : null;
    }catch(e){
      out[k] = null;
    }
  }
  return out;
}

// ============ AUTOMATIC DAILY BACKUP (server-side, no download needed) ============
// Unlike exportBackup() (a manual file download), this silently snapshots the whole database
// into its own kv_store row once per real day and keeps a rolling window of recent days — so
// data isn't only ever one bad write away from being unrecoverable, even if the doctor forgets
// to export manually. Runs once at boot, fire-and-forget, never blocks or shows anything unless
// it fails (logged only, not surfaced — a missed auto-backup shouldn't interrupt the workday).
const AUTO_BACKUP_RETENTION_DAYS = 14;
async function maybeRunAutoBackup(){
  try{
    const today = todayStr();
    const lastRun = await getData('lastAutoBackupDate', null);
    if(lastRun === today) return; // already ran today (on this or another device)
    const data = await collectAllData();
    const payload = { schemaVersion: BACKUP_SCHEMA_VERSION, exportedAt: new Date().toISOString(), app: 'Orenda Orthodontic System', auto: true, data };
    const ok = await setData('dailybackup:' + today, payload);
    if(!ok) return; // don't mark today as "done" if the snapshot itself didn't save
    await setData('lastAutoBackupDate', today);
    await pruneOldAutoBackups();
  }catch(e){
    console.error('auto backup failed', e); // best-effort — never surfaced to the user
  }
}

async function pruneOldAutoBackups(){
  try{
    const keys = await idbListKeys();
    // "dailybackup:YYYY-MM-DD" sorts chronologically as plain strings, so the oldest keys are
    // simply the first ones after a lexical sort — no date parsing needed
    const backupKeys = keys.filter(k => k.indexOf('dailybackup:') === 0).sort();
    const excess = backupKeys.length - AUTO_BACKUP_RETENTION_DAYS;
    if(excess <= 0) return;
    for(const k of backupKeys.slice(0, excess)){
      try{ await idbDelete(k); }catch(e){ console.error('failed to prune old auto backup', k, e); }
    }
  }catch(e){
    console.error('prune old auto backups failed', e);
  }
}

// لسه بيدور على dailybackup:* فقط (مش على النسخ المأخوذة تلقائيًا قبل استيراد — preimport
// snapshots ليها زرار/قايمة تانية لو احتجتها، مقصود مش يظهروا هنا عشان القايمة دي مخصصة
// للنسخ اليومية العادية بس)
async function listAutoBackups(){
  const keys = await idbListKeys();
  return keys.filter(k => k.indexOf('dailybackup:') === 0).sort().reverse(); // newest first
}
async function downloadAutoBackup(key){
  const raw = await idbGet(key);
  if(!raw){ toast('النسخة دي مش موجودة'); return; }
  const payload = JSON.parse(raw);
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
          <span style="display:flex;gap:6px;">
            <button class="secondary small" data-restore-backup="${k}">↩ استرجاع</button>
            <button class="secondary small" data-download-backup="${k}">⬇ تحميل</button>
          </span>
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
  bg.querySelectorAll('[data-restore-backup]').forEach(el=>{
    el.onclick = async () => { bg.remove(); await restoreAutoBackup(el.dataset.restoreBackup); };
  });
}

async function exportBackup(){
  toast('بيجهّز الملف...');
  const data = await collectAllData();
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
async function snapshotBeforeImport(){
  const data = await collectAllData();
  const key = 'preimportsnapshot:' + new Date().toISOString();
  await setData(key, { schemaVersion: BACKUP_SCHEMA_VERSION, exportedAt: new Date().toISOString(), app: 'Orenda Orthodontic System', reason: 'pre-import auto snapshot', data });
  return key;
}

// بيبني ملخص التغييرات المتوقعة للمفاتيح المسموحة (whitelisted) بس، قبل ما يتنفذ أي حاجة فعليًا.
// المقارنة بـ JSON.stringify — كفاية عشان نعرف هيضاف/هيتغير/هيفضل زي ما هو، مفيش داعي لـ diff
// تفصيلي جوه كل ملف مريض دلوقتي.
async function buildImportDiffSummary(data, importKeys){
  const added = [], changed = [], unchanged = [];
  for(const k of importKeys){
    let current = null;
    try{ const raw = await idbGet(k); current = raw ? JSON.parse(raw) : null; }catch(e){ current = null; }
    if(current === null) added.push(k);
    else if(canonicalStringify(current) !== canonicalStringify(data[k])) changed.push(k);
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

// الكتابة الفعلية للمفاتيح (مع محاولة تانية لأي فشل عابر) — مفصولة عشان تتختبر في tests.js
// بمخزن وهمي من غير UI. بترجّع المفاتيح اللي فشلت حتى بعد المحاولة التانية.
async function applyImportData(data, importKeys){
  let failed = [];
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
    failed = stillFailed;
  }
  return failed;
}

// بعد الاستيراد: بيقرا كل مفتاح من القاعدة تاني ويقارنه بالنسخة اللي اتستوردت — عشان "اتحفظ"
// يبقى معناها فعلاً "اترجع صح". بيرجّع المفاتيح اللي مش مطابقة.
async function verifyImportedData(data, importKeys){
  const mismatched = [];
  for(const k of importKeys){
    let current = null;
    try{ const raw = await idbGet(k); current = raw ? JSON.parse(raw) : null; }catch(e){ current = null; }
    if(canonicalStringify(current) !== canonicalStringify(data[k])) mismatched.push(k);
  }
  return mismatched;
}

async function importBackup(file){
  try{
    const text = await file.text();
    const payload = JSON.parse(text);
    await importBackupPayload(payload, { source: 'file' });
  }catch(e){
    console.error('import failed', e);
    await logAuditEvent('backup_import_failed', { error: (e && e.message) || String(e), source: 'file' });
    toast('فشل استيراد الملف — تأكد إنه ملف نسخة احتياطية صحيح');
  }
}

// استرجاع من نسخة تلقائية محفوظة على السيرفر (dailybackup:YYYY-MM-DD) — نفس مسار الاستيراد
// بالظبط (schemaVersion + whitelist + diff + snapshot أمان + تحقق بعد الكتابة).
async function restoreAutoBackup(key){
  try{
    const raw = await idbGet(key);
    if(!raw){ toast('النسخة دي مش موجودة'); return; }
    const payload = JSON.parse(raw);
    await importBackupPayload(payload, { source: key });
  }catch(e){
    console.error('restore failed', key, e);
    await logAuditEvent('backup_restore_failed', { key, error: (e && e.message) || String(e) });
    toast('فشل الاسترجاع من النسخة دي — ملفها ممكن يكون تالف');
  }
}

async function importBackupPayload(payload, opts){
  const source = (opts && opts.source) || 'file';
  {
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

    // ---- 2) whitelist: نفصل المفاتيح المعروفة عن أي حاجة غريبة قبل ما نلمس أي حاجة في القاعدة.
    // مفاتيح الـ meta المعروفة (نسخ يومية متداخلة جوه نسخ قديمة، إلخ) بتتتجاهل بهدوء ومش بتتعد "مرفوضة".
    const metaKeys = allKeys.filter(isBackupExcludedKey);
    const importKeys = allKeys.filter(isImportAllowedKey);
    const rejectedKeys = allKeys.filter(k => !isImportAllowedKey(k) && !isBackupExcludedKey(k));
    if(!importKeys.length){
      await alertModal('مفيش أي مفتاح معروف/مسموح في الملف ده — الاستيراد اتوقف.');
      return;
    }

    // ---- 3) ملخص التغييرات قبل أي تنفيذ فعلي (الإلغاء هنا = تجربة جافة من غير أي كتابة)
    toast('بيجهّز ملخص الاستيراد...');
    const diff = await buildImportDiffSummary(data, importKeys);
    const proceed = await showImportDiffModal(diff, rejectedKeys);
    if(!proceed) return;

    if(!(await confirmModal('هيتم استبدال بيانات نفس المرضى/العيادات لو موجودين بنفس الأرقام حسب الملخص فوق. أي مريض/تعديل اتعمل بعد تاريخ النسخة دي ومش موجود فيها مش هيتمسح لكن قايمة المرضى هترجع زي النسخة. متأكد إنك عايز تكمل؟'))) return;

    // ---- 4) snapshot تلقائي قبل التنفيذ الفعلي (رجوع مضمون لو حصل غلط)
    toast('بياخد نسخة أمان قبل الاستيراد...');
    const snapshotKey = await snapshotBeforeImport();

    // ---- 5) التنفيذ: المفاتيح المسموحة بس، مع محاولة تانية لأي فشل عابر
    const failed = await applyImportData(data, importKeys);

    // ---- 5b) تحقق فعلي: نقرا اللي اتكتب من القاعدة ونقارنه بالنسخة (بترتيب مفاتيح موحّد)
    const okKeys = importKeys.filter(k => !failed.includes(k));
    const mismatched = await verifyImportedData(data, okKeys);

    await loadClinics();
    state.view = 'clinics';
    render();

    // ---- 6) تسجيل العملية في سجل التدقيق — سواء نجحت كلها أو فيها فاشل
    await logAuditEvent('backup_import', {
      source,
      fileExportedAt: payload.exportedAt || null,
      importedKeys: okKeys.filter(k => !mismatched.includes(k)),
      failedKeys: failed,
      verifyMismatchKeys: mismatched,
      rejectedKeys,
      ignoredMetaKeysCount: metaKeys.length,
      preImportSnapshotKey: snapshotKey
    });
    if(typeof logActivity === 'function'){
      await logActivity('backup_restore', `استرجاع/استيراد نسخة احتياطية (${source}) — ${okKeys.length - mismatched.length} مفتاح اتحقق منه، ${failed.length} فشل، ${mismatched.length} مش مطابق`);
    }

    if(failed.length || mismatched.length){
      await alertModal((failed.length ? 'الأجزاء دي فشلت في الرفع حتى بعد إعادة المحاولة:\n' + failed.join('\n') + '\n\n' : '')
        + (mismatched.length ? 'الأجزاء دي اتكتبت لكن القراءة بعدها مش مطابقة للنسخة (راجعها):\n' + mismatched.join('\n') + '\n\n' : '')
        + 'تأكد إن النت شغال ومستقر وحاول تاني.\n\n(في نسخة أمان كاملة محفوظة من قبل الاستيراد لو احتجت ترجع لها).');
    } else {
      toast(rejectedKeys.length ? `اتضافت البيانات المعروفة وتم التحقق منها — واترفض ${rejectedKeys.length} مفتاح غير معروف` : 'اتسترجعت النسخة بالكامل وتم التحقق من كل المفاتيح ✓');
    }
  }
}

function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 1800);
}
