// backup.js — تصدير/استيراد نسخة احتياطية من كل البيانات
// ============ BACKUP EXPORT / IMPORT ============
async function collectAllData(){
  const out = {};
  const keys = await idbListKeys();
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
    const payload = { exportedAt: new Date().toISOString(), app: 'Orenda Orthodontic System', auto: true, data };
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

// lets the doctor pick and download any of the last 14 days' auto-backups from the UI, the same
// way exportBackup() downloads a manual one — same file shape, just sourced from a saved snapshot
// instead of a fresh collectAllData() call.
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
  const data = await collectAllData();
  const payload = {
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

async function importBackup(file){
  if(!(await confirmModal('استيراد النسخة دي هيستبدل بيانات نفس المرضى/العيادات لو موجودين بنفس الأرقام. تكمل؟'))) return;
  try{
    const text = await file.text();
    const payload = JSON.parse(text);
    const data = payload && payload.data ? payload.data : payload; // tolerate raw dump too
    const keys = Object.keys(data || {}).filter(k => data[k] !== null && data[k] !== undefined);
    if(!keys.length){ toast('الملف فاضي أو مش صالح'); return; }

    // upload every key, tracking which ones actually succeeded — a partial failure must NOT
    // be reported as a full success (this silently dropped the inventory key once before)
    const failed = [];
    for(const k of keys){
      const ok = await setData(k, data[k]);
      if(!ok) failed.push(k);
    }
    // one retry pass for anything that failed (covers a transient network hiccup)
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

    if(failed.length){
      await alertModal('تم استيراد معظم البيانات، لكن الأجزاء دي فشلت في الرفع حتى بعد إعادة المحاولة:\n' + failed.join('\n') + '\n\nتأكد إن النت شغال ومستقر وحاول تستورد نفس الملف تاني.');
    } else {
      toast('اتضافت النسخة الاحتياطية بالكامل');
    }
  }catch(e){
    console.error('import failed', e);
    toast('فشل استيراد الملف — تأكد إنه ملف نسخة احتياطية صحيح');
  }
}

function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 1800);
}

