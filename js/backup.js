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

