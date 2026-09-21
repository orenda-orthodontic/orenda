// audit-log.js — سجل تدقيق (Audit Log) للعمليات الحساسة. بيتخزن شهريًا تحت مفاتيح
// auditlog:<YYYY-MM> (نفس فكرة dailybackup: في backup.js) عشان الشهر القديم مايتحملش كله
// مرة واحدة والمفتاح مايكبرش لانهاية. الاستدعاء دايمًا fire-and-forget من ناحية اللي بيستدعيه:
// فشل تسجيل الـ audit نفسه ما ينفعش يوقف العملية الأصلية (استيراد، خصم، ...).
//
// استخدام: await logAuditEvent('backup_import', { importedKeys, failedKeys, ... });
//
// ده أول تغطية فعلية للـ audit log المطلوب في القايمة (P0-3 + النقطة "Audit Log طبي ومالي").
// باقي العمليات الحساسة المذكورة (تعديل مريض، حذف صورة، تغيير نسبة عيادة، خصم مخزون، تسجيل
// دفعة، فك حالة، تعليم صورة للسوشيال) لسه محتاجة نفس السطر ده يتضاف في أماكنها — الملف ده بس
// بنى الأداة المشتركة؛ التوصيل في كل مكان محتاج مراجعة كل ملف على حدة.

// الكتابة بتمر في طابور واحد: كل تسجيل بيقرا شهر كامل ويكتبه تاني، فتسجيلين متزامنين كان أحدهم
// بيمسح التاني (آخر كتابة بتكسب). ومفيش undo ليها — Ctrl+Z ميرجّعش سطر من سجل التدقيق.
let _auditQueueTail = Promise.resolve();
function logAuditEvent(action, details){
  const run = _auditQueueTail.then(() => _logAuditEventNow(action, details), () => _logAuditEventNow(action, details));
  _auditQueueTail = run.catch(() => {});
  return run;
}
async function _logAuditEventNow(action, details){
  try{
    const ym = currentMonthStr();
    const key = 'auditlog:' + ym;
    const existing = await getData(key, []);
    if(typeof _readFailedKeys !== 'undefined' && _readFailedKeys[key]) return; // قراءة الشهر فشلت — منكتبش فوقه
    const entry = {
      id: uid(),
      ts: new Date().toISOString(),
      user: (typeof authSession !== 'undefined' && authSession && authSession.email) || 'unknown',
      action,
      details: details || {}
    };
    existing.push(entry);
    await setData(key, existing, { skipUndo: true });
  }catch(e){
    // فشل تسجيل الـ audit نفسه ما ينفعش يوقف العملية الأصلية — بس نسجله في الـ console
    console.error('audit log failed', action, e);
  }
}

async function listAuditMonths(){
  const keys = await idbListKeys();
  return keys.filter(k => k.indexOf('auditlog:') === 0).sort().reverse();
}

// نافذة بسيطة لعرض سجل التدقيق شهر بشهر — استدعيها من أي زرار زي "سجل التدقيق"
async function openAuditLogModal(){
  const months = await listAuditMonths();
  const ym = months.length ? months[0].replace('auditlog:', '') : currentMonthStr();
  await renderAuditLogModal(ym, months.length ? months : ['auditlog:' + ym]);
}

async function renderAuditLogModal(ym, months){
  const old = document.getElementById('auditLogModalBg');
  if(old) old.remove();
  const entries = (await getData('auditlog:' + ym, [])).slice().reverse();
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.id = 'auditLogModalBg';
  bg.innerHTML = `
    <div class="modal" style="max-width:640px;width:95%;">
      <h3>سجل التدقيق — ${escapeHtml(typeof monthLabelAr === 'function' ? monthLabelAr(ym) : ym)}</h3>
      <div class="row" style="gap:8px;margin-bottom:10px;">
        <select id="auditMonthSelect">
          ${months.map(k => {
            const my = k.replace('auditlog:', '');
            return `<option value="${my}" ${my === ym ? 'selected' : ''}>${escapeHtml(typeof monthLabelAr === 'function' ? monthLabelAr(my) : my)}</option>`;
          }).join('')}
        </select>
      </div>
      <div style="max-height:55vh;overflow-y:auto;">
        ${entries.length ? entries.map(e => `
          <div style="border-bottom:1px solid var(--border);padding:8px 0;font-size:12px;">
            <div><b>${escapeHtml(e.action)}</b> — ${escapeHtml(e.user || '')} — ${escapeHtml(new Date(e.ts).toLocaleString('ar-EG'))}</div>
            ${e.details && Object.keys(e.details).length ? `<pre style="white-space:pre-wrap;color:var(--muted);margin:4px 0 0;font-size:11px;">${escapeHtml(JSON.stringify(e.details, null, 2))}</pre>` : ''}
          </div>
        `).join('') : `<div class="placeholder">مفيش عمليات مسجلة الشهر ده</div>`}
      </div>
      <div class="modal-actions">
        <button id="closeAuditLogModalBtn">تمام</button>
      </div>
    </div>
  `;
  document.body.appendChild(bg);
  bg.onclick = (e) => { if(e.target === bg) bg.remove(); };
  document.getElementById('closeAuditLogModalBtn').onclick = () => bg.remove();
  document.getElementById('auditMonthSelect').onchange = (e) => renderAuditLogModal(e.target.value, months);
}
