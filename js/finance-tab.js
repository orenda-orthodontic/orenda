// finance-tab.js — تبويب الحسابات المالية
// ============ FINANCE TAB ============
function printPatientStatement(){
  const file = state.currentPatientFile;
  const patient = state.patients.find(p=>p.id === state.currentPatientId);
  const clinic = state.clinics.find(c=>c.id === state.currentClinicId);
  if(!patient || !file) return;
  const total = parseFloat(file.financeTotal) || 0;
  const extras = file.financeExtras || [];
  const extrasSum = extras.reduce((s,e)=> s + (parseFloat(e.amount)||0), 0);
  const payments = file.payments || [];
  const paidSum = payments.reduce((s,p)=> s + (parseFloat(p.amount)||0), 0);
  const caseValue = total + extrasSum;
  const remaining = caseValue - paidSum;
  const paymentsSorted = [...payments].sort((a,b)=>(a.date||'').localeCompare(b.date||''));
  const extrasSorted = [...extras].sort((a,b)=>(a.date||'').localeCompare(b.date||''));

  const paymentsRows = paymentsSorted.map(p=>`<tr><td>${formatDateAr(p.date)}</td><td>${(parseFloat(p.amount)||0).toLocaleString()} جنيه</td><td>${escapeHtml(p.note||'')}</td></tr>`).join('') || '<tr><td colspan="3">لا يوجد دفعات</td></tr>';
  const extrasRows = extrasSorted.map(e=>`<tr><td>${formatDateAr(e.date)}</td><td>${escapeHtml(e.reason||'')}</td><td>${(parseFloat(e.amount)||0).toLocaleString()} جنيه</td></tr>`).join('') || '<tr><td colspan="3">لا يوجد رسوم إضافية</td></tr>';

  const html = `
    <!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">
    <title>كشف حساب — ${escapeHtml(patient.name)}</title>
    <style>
      body{font-family:Tahoma,Arial,sans-serif;padding:24px;color:#222;}
      h1{font-size:20px;margin-bottom:4px;}
      .meta{color:#555;font-size:13px;margin-bottom:18px;}
      table{width:100%;border-collapse:collapse;margin-bottom:20px;}
      th,td{border:1px solid #ccc;padding:6px 10px;text-align:right;font-size:13px;}
      th{background:#f4f4f4;}
      .totals{margin-top:10px;font-size:14px;}
      .totals div{margin-bottom:4px;}
      .totals b{display:inline-block;min-width:160px;}
      @media print{ button{display:none;} }
    </style>
    </head><body>
      <h1>كشف حساب — ${escapeHtml(patient.name)}</h1>
      <div class="meta">
        رقم المريض: ${escapeHtml(patient.number||'-')} | العيادة: ${escapeHtml(clinic?clinic.name:'')} | تاريخ الطباعة: ${formatDateAr(todayStr())}
      </div>
      <h3>الدفعات</h3>
      <table><thead><tr><th>التاريخ</th><th>المبلغ</th><th>ملاحظة</th></tr></thead><tbody>${paymentsRows}</tbody></table>
      <h3>رسوم إضافية</h3>
      <table><thead><tr><th>التاريخ</th><th>السبب</th><th>المبلغ</th></tr></thead><tbody>${extrasRows}</tbody></table>
      <div class="totals">
        <div><b>إجمالي قيمة الحالة:</b> ${caseValue.toLocaleString()} جنيه</div>
        <div><b>المدفوع:</b> ${paidSum.toLocaleString()} جنيه</div>
        <div><b>المتبقي:</b> ${remaining.toLocaleString()} جنيه</div>
      </div>
      <button onclick="window.print()" style="margin-top:20px;padding:8px 16px;">طباعة / حفظ PDF</button>
    </body></html>
  `;
  const w = window.open('', '_blank');
  if(!w){ toast('المتصفح منع فتح نافذة جديدة — اسمح بالنوافذ المنبثقة وحاول تاني'); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
}

function renderFinanceTab(){
  const file = state.currentPatientFile;
  const clinic = state.clinics.find(c=>c.id === state.currentClinicId);
  const commissionPct = clinic ? (parseFloat(clinic.commission) || 70) : 70;
  const total = parseFloat(file.financeTotal) || 0;
  const extras = file.financeExtras || [];
  const extrasSum = extras.reduce((s,e)=> s + (parseFloat(e.amount)||0), 0);
  const payments = file.payments || [];
  const paidSum = payments.reduce((s,p)=> s + (parseFloat(p.amount)||0), 0);
  const caseValue = total + extrasSum;
  const remaining = caseValue - paidSum;
  const yourShare = caseValue * (commissionPct/100);
  const clinicShare = caseValue - yourShare;

  const paymentsSorted = [...payments].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const extrasSorted = [...extras].sort((a,b)=>(b.date||'').localeCompare(a.date||''));

  const paymentsHtml = paymentsSorted.length ? `
    <div class="finance-tables">
      <table>
        <thead><tr><th>التاريخ</th><th>المبلغ</th><th>ملاحظة</th><th></th></tr></thead>
        <tbody>
          ${paymentsSorted.map(p=>`
            <tr>
              <td>${escapeHtml(p.date||'')}</td>
              <td>${(parseFloat(p.amount)||0).toLocaleString()} جنيه</td>
              <td>${escapeHtml(p.note||'')}</td>
              <td>
                <button class="secondary small" data-edit-payment="${p.id}">تعديل</button>
                <button class="danger small" data-del-payment="${p.id}">حذف</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  ` : `<div class="placeholder" style="margin-top:8px;">لسه مفيش دفعات مسجلة</div>`;

  const extrasHtml = extrasSorted.length ? `
    <div class="finance-tables">
      <table>
        <thead><tr><th>التاريخ</th><th>السبب</th><th>المبلغ</th><th></th></tr></thead>
        <tbody>
          ${extrasSorted.map(e=>`
            <tr>
              <td>${escapeHtml(e.date||'')}</td>
              <td>${escapeHtml(e.reason||'')}</td>
              <td>${(parseFloat(e.amount)||0).toLocaleString()} جنيه</td>
              <td>
                <button class="secondary small" data-edit-extra="${e.id}">تعديل</button>
                <button class="danger small" data-del-extra="${e.id}">حذف</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  ` : `<div class="placeholder" style="margin-top:8px;">لا يوجد رسوم إضافية</div>`;

  const AR_MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  function monthLabelAr(ym){
    const [y,m] = ym.split('-');
    const idx = parseInt(m,10) - 1;
    return (AR_MONTHS[idx] || m) + ' ' + y;
  }
  const monthlyMap = {};
  payments.forEach(p=>{
    const ym = (p.date||'').slice(0,7);
    if(!ym) return;
    monthlyMap[ym] = (monthlyMap[ym]||0) + (parseFloat(p.amount)||0);
  });
  const months = Object.keys(monthlyMap).sort((a,b)=>b.localeCompare(a));
  const monthlyCommissionHtml = months.length ? `
    <div class="finance-tables">
      <table>
        <thead><tr><th>الشهر</th><th>المدفوع</th><th>نصيبك (${commissionPct}%)</th><th>نصيب العيادة</th></tr></thead>
        <tbody>
          ${months.map(ym=>{
            const amt = monthlyMap[ym];
            const yShare = amt * (commissionPct/100);
            const cShare = amt - yShare;
            return `<tr><td>${monthLabelAr(ym)}</td><td>${amt.toLocaleString()} جنيه</td><td>${yShare.toLocaleString()} جنيه</td><td>${cShare.toLocaleString()} جنيه</td></tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  ` : `<div class="placeholder" style="margin-top:8px;">لسه مفيش دفعات مسجلة بتاريخ عشان نحسب التوزيع الشهري</div>`;

  return `
    <div class="section-title">الحسابات</div>
    <div class="row" style="margin-bottom:10px;">
      <button class="secondary small" id="printStatementBtn">🖨️ طباعة / تصدير كشف الحساب</button>
    </div>
    <div class="field" style="max-width:240px;">
      <label>التوتال المتفق عليه (بدون الإضافات)</label>
      <input type="number" id="financeTotalInput" value="${total}">
    </div>
    <div class="bracket-summary" style="margin-top:14px;">
      <div class="bracket-stat"><div class="num">${caseValue.toLocaleString()}</div><div class="lbl">إجمالي قيمة الحالة</div></div>
      <div class="bracket-stat"><div class="num">${paidSum.toLocaleString()}</div><div class="lbl">المدفوع</div></div>
      <div class="bracket-stat"><div class="num">${remaining.toLocaleString()}</div><div class="lbl">المتبقي</div></div>
    </div>
    <div class="bracket-summary">
      <div class="bracket-stat"><div class="num">${yourShare.toLocaleString()}</div><div class="lbl">نصيبك (${commissionPct}%)</div></div>
      <div class="bracket-stat"><div class="num">${clinicShare.toLocaleString()}</div><div class="lbl">نصيب العيادة</div></div>
    </div>

    <div class="section-title" style="font-size:13px;margin-top:18px;">الدفعات</div>
    <div class="row" style="margin-bottom:10px;">
      <button class="secondary small" id="addPaymentBtn">+ تسجيل دفعة</button>
    </div>
    ${paymentsHtml}

    <div class="section-title" style="font-size:13px;margin-top:18px;">توزيع العمولة شهريًا (حسب المدفوع)</div>
    ${monthlyCommissionHtml}

    <div class="section-title" style="font-size:13px;margin-top:18px;">رسوم إضافية</div>
    <div class="row" style="margin-bottom:10px;">
      <button class="secondary small" id="addExtraBtn">+ إضافة رسوم</button>
    </div>
    ${extrasHtml}
  `;
}

async function updateFinanceTotal(value){
  const file = state.currentPatientFile;
  file.financeTotal = parseFloat(value) || 0;
  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  toast('اتحفظ');
  render();
}

function openAddPaymentModal(){
  const today = todayStr();
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `
    <div class="modal">
      <h3>تسجيل دفعة</h3>
      <div class="field"><label>المبلغ</label><input type="number" id="newPaymentAmount"></div>
      <div class="field"><label>التاريخ</label><input type="date" id="newPaymentDate" value="${today}"></div>
      <div class="field"><label>ملاحظة (اختياري)</label><input type="text" id="newPaymentNote"></div>
      <div class="modal-actions">
        <button class="secondary" id="cancelPaymentBtn">إلغاء</button>
        <button id="savePaymentBtn">حفظ</button>
      </div>
    </div>
  `;
  document.body.appendChild(bg);
  document.getElementById('cancelPaymentBtn').onclick = () => bg.remove();
  bg.onclick = (e) => { if(e.target === bg) bg.remove(); };
  document.getElementById('savePaymentBtn').onclick = async () => {
    const amount = parseFloat(document.getElementById('newPaymentAmount').value) || 0;
    const date = document.getElementById('newPaymentDate').value || today;
    const note = document.getElementById('newPaymentNote').value.trim();
    if(amount <= 0){ toast('اكتب مبلغ صحيح'); return; }
    const file = state.currentPatientFile;
    if(!file.payments) file.payments = [];
    file.payments.push({ id: uid(), amount, date, note });
    await savePatientFile(state.currentPatientId, stripHelperFields(file));
    await logActivity('add_payment', `أضاف دفعة ${amount} جنيه لمريض ${patientNameForLog()}`);
    bg.remove();
    render();
  };
  setTimeout(()=>document.getElementById('newPaymentAmount').focus(), 50);
}

function openAddExtraModal(){
  const today = todayStr();
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `
    <div class="modal">
      <h3>إضافة رسوم إضافية</h3>
      <div class="field"><label>السبب</label><input type="text" id="newExtraReason" placeholder="مثلاً: تغيير سلك"></div>
      <div class="field"><label>المبلغ</label><input type="number" id="newExtraAmount"></div>
      <div class="field"><label>التاريخ</label><input type="date" id="newExtraDate" value="${today}"></div>
      <div class="modal-actions">
        <button class="secondary" id="cancelExtraBtn">إلغاء</button>
        <button id="saveExtraBtn">حفظ</button>
      </div>
    </div>
  `;
  document.body.appendChild(bg);
  document.getElementById('cancelExtraBtn').onclick = () => bg.remove();
  bg.onclick = (e) => { if(e.target === bg) bg.remove(); };
  document.getElementById('saveExtraBtn').onclick = async () => {
    const reason = document.getElementById('newExtraReason').value.trim();
    const amount = parseFloat(document.getElementById('newExtraAmount').value) || 0;
    const date = document.getElementById('newExtraDate').value || today;
    if(!reason){ toast('اكتب السبب'); return; }
    if(amount <= 0){ toast('اكتب مبلغ صحيح'); return; }
    const file = state.currentPatientFile;
    if(!file.financeExtras) file.financeExtras = [];
    file.financeExtras.push({ id: uid(), amount, reason, date });
    await savePatientFile(state.currentPatientId, stripHelperFields(file));
    await logActivity('add_extra', `أضاف رسوم إضافية "${reason}" (${amount} جنيه) لمريض ${patientNameForLog()}`);
    bg.remove();
    render();
  };
  setTimeout(()=>document.getElementById('newExtraReason').focus(), 50);
}

function openEditPaymentModal(id){
  const file = state.currentPatientFile;
  const p = (file.payments||[]).find(x=>x.id===id);
  if(!p) return;
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `
    <div class="modal">
      <h3>تعديل الدفعة</h3>
      <div class="field"><label>المبلغ</label><input type="number" id="editPaymentAmount" value="${p.amount||0}"></div>
      <div class="field"><label>التاريخ</label><input type="date" id="editPaymentDate" value="${p.date||''}"></div>
      <div class="field"><label>ملاحظة (اختياري)</label><input type="text" id="editPaymentNote" value="${escapeHtml(p.note||'')}"></div>
      <div class="modal-actions">
        <button class="secondary" id="cancelEditPaymentBtn">إلغاء</button>
        <button id="saveEditPaymentBtn">حفظ</button>
      </div>
    </div>
  `;
  document.body.appendChild(bg);
  document.getElementById('cancelEditPaymentBtn').onclick = () => bg.remove();
  bg.onclick = (e) => { if(e.target === bg) bg.remove(); };
  document.getElementById('saveEditPaymentBtn').onclick = async () => {
    const amount = parseFloat(document.getElementById('editPaymentAmount').value) || 0;
    const date = document.getElementById('editPaymentDate').value || p.date;
    const note = document.getElementById('editPaymentNote').value.trim();
    if(amount <= 0){ toast('اكتب مبلغ صحيح'); return; }
    p.amount = amount; p.date = date; p.note = note;
    await savePatientFile(state.currentPatientId, stripHelperFields(file));
    await logActivity('edit_payment', `عدّل دفعة (${amount} جنيه) لمريض ${patientNameForLog()}`);
    bg.remove();
    render();
  };
  setTimeout(()=>document.getElementById('editPaymentAmount').focus(), 50);
}

function openEditExtraModal(id){
  const file = state.currentPatientFile;
  const ex = (file.financeExtras||[]).find(x=>x.id===id);
  if(!ex) return;
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `
    <div class="modal">
      <h3>تعديل الرسوم الإضافية</h3>
      <div class="field"><label>السبب</label><input type="text" id="editExtraReason" value="${escapeHtml(ex.reason||'')}"></div>
      <div class="field"><label>المبلغ</label><input type="number" id="editExtraAmount" value="${ex.amount||0}"></div>
      <div class="field"><label>التاريخ</label><input type="date" id="editExtraDate" value="${ex.date||''}"></div>
      <div class="modal-actions">
        <button class="secondary" id="cancelEditExtraBtn">إلغاء</button>
        <button id="saveEditExtraBtn">حفظ</button>
      </div>
    </div>
  `;
  document.body.appendChild(bg);
  document.getElementById('cancelEditExtraBtn').onclick = () => bg.remove();
  bg.onclick = (e) => { if(e.target === bg) bg.remove(); };
  document.getElementById('saveEditExtraBtn').onclick = async () => {
    const reason = document.getElementById('editExtraReason').value.trim();
    const amount = parseFloat(document.getElementById('editExtraAmount').value) || 0;
    const date = document.getElementById('editExtraDate').value || ex.date;
    if(!reason){ toast('اكتب السبب'); return; }
    if(amount <= 0){ toast('اكتب مبلغ صحيح'); return; }
    ex.reason = reason; ex.amount = amount; ex.date = date;
    await savePatientFile(state.currentPatientId, stripHelperFields(file));
    bg.remove();
    render();
  };
  setTimeout(()=>document.getElementById('editExtraReason').focus(), 50);
}

async function deletePayment(id){
  if(!(await confirmModal('حذف الدفعة دي؟', {danger:true}))) return;
  const file = state.currentPatientFile;
  const p = (file.payments||[]).find(x=>x.id===id);
  file.payments = (file.payments||[]).filter(p=>p.id !== id);
  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  await logActivity('delete_payment', `حذف دفعة (${p ? p.amount : '?'} جنيه) من مريض ${patientNameForLog()}`);
  render();
}

async function deleteFinanceExtra(id){
  const file = state.currentPatientFile;
  const isBreakCharge = (file.financeExtras||[]).some(e=>e.id===id) && (function(){
    const bm = ensureBracketMap(file);
    return Object.values(bm.teeth).some(t=>t.breaks.some(b=>b.id===id));
  })();
  const msg = isBreakCharge
    ? 'حذف الرسوم دي هيشيل معاها سجل الكسر المرتبط من خريطة الفصوص، ولو كان جاي من "rebonding" في المتابعة الشهرية هيرجع الكمية المخصومة للمخزن تلقائي. متأكد؟'
    : 'حذف الرسوم دي؟';
  if(!(await confirmModal(msg, {danger:true}))) return;

  file.financeExtras = (file.financeExtras||[]).filter(e=>e.id !== id);

  if(isBreakCharge){
    const bm = ensureBracketMap(file);
    Object.values(bm.teeth).forEach(t=>{
      const idx = t.breaks.findIndex(b=>b.id===id);
      if(idx>-1) t.breaks.splice(idx,1);
    });
    let inventoryChanged = false;
    (file.monthlyLog||[]).forEach(entry=>{
      if(!entry.materialsUsed) return;
      const linked = entry.materialsUsed.find(u=>u.linkedBreakId === id);
      if(linked){
        const item = state.inventory.find(i=>i.id === linked.itemId);
        if(item){ item.qty = (parseFloat(item.qty)||0) + (parseFloat(linked.qty)||0); inventoryChanged = true; }
        entry.materialsUsed = entry.materialsUsed.filter(u=>u.linkedBreakId !== id);
      }
    });
    if(inventoryChanged) await saveInventory();
  }

  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  render();
}

function attachFinanceHandlers(){
  const printBtn = document.getElementById('printStatementBtn');
  if(printBtn) printBtn.onclick = () => printPatientStatement();
  const totalInput = document.getElementById('financeTotalInput');
  if(totalInput) totalInput.onchange = () => updateFinanceTotal(totalInput.value);
  const addPaymentBtn = document.getElementById('addPaymentBtn');
  if(addPaymentBtn) addPaymentBtn.onclick = () => openAddPaymentModal();
  const addExtraBtn = document.getElementById('addExtraBtn');
  if(addExtraBtn) addExtraBtn.onclick = () => openAddExtraModal();
  document.querySelectorAll('[data-del-payment]').forEach(el=>{
    el.onclick = () => deletePayment(el.dataset.delPayment);
  });
  document.querySelectorAll('[data-edit-payment]').forEach(el=>{
    el.onclick = () => openEditPaymentModal(el.dataset.editPayment);
  });
  document.querySelectorAll('[data-del-extra]').forEach(el=>{
    el.onclick = () => deleteFinanceExtra(el.dataset.delExtra);
  });
  document.querySelectorAll('[data-edit-extra]').forEach(el=>{
    el.onclick = () => openEditExtraModal(el.dataset.editExtra);
  });
}

