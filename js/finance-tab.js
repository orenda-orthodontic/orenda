// finance-tab.js — تبويب الحسابات المالية
// P0-5: كل حساب هنا (الإجمالي، المدفوع، المتبقي، نصيب الدكتور/العيادة، التوزيع الشهري) بقى
// بيتم بالقروش (integer cents) عن طريق money-utils.js، بدل جمع/طرح أرقام float مباشرة —
// بيقفل الباب على أخطاء التقريب المتراكمة مع كتر الدفعات على مدار سنين. الحقول القديمة
// (financeTotal, financeRemaining, payments[].amount, financeExtras[].amount — كلها EGP float)
// لسه بتتحفظ متزامنة (dual-write) جنب الحقول الجديدة (*Cents) عشان أي ملف تاني في النظام
// (clinic-features.js, patients-view.js, reports-view.js, case-tracker) يفضل شغال زي الأول.
// ============ FINANCE TAB ============
function printPatientStatement(){
  const file = state.currentPatientFile;
  const patient = state.patients.find(p=>p.id === state.currentPatientId);
  const clinic = state.clinics.find(c=>c.id === state.currentClinicId);
  if(!patient || !file) return;
  const totalCents = readFinanceTotalCents(file);
  const extras = file.financeExtras || [];
  const extrasSumCents = extras.reduce((s,e)=> s + readAmountCents(e), 0);
  const payments = file.payments || [];
  const paidSumCents = payments.reduce((s,p)=> s + readAmountCents(p), 0);
  const caseValueCents = totalCents + extrasSumCents;
  const manualRemainingCents = readFinanceRemainingCents(file);
  const remainingCents = manualRemainingCents !== null ? manualRemainingCents : (caseValueCents - paidSumCents);
  const paymentsSorted = [...payments].sort((a,b)=>(a.date||'').localeCompare(b.date||''));
  const extrasSorted = [...extras].sort((a,b)=>(a.date||'').localeCompare(b.date||''));

  const paymentsRows = paymentsSorted.map(p=>`<tr><td>${formatDateAr(p.date)}</td><td>${formatEgpFromCents(readAmountCents(p))} جنيه</td><td>${escapeHtml(p.note||'')}</td></tr>`).join('') || '<tr><td colspan="3">لا يوجد دفعات</td></tr>';
  const extrasRows = extrasSorted.map(e=>`<tr><td>${formatDateAr(e.date)}</td><td>${escapeHtml(e.reason||'')}</td><td>${formatEgpFromCents(readAmountCents(e))} جنيه</td></tr>`).join('') || '<tr><td colspan="3">لا يوجد رسوم إضافية</td></tr>';

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
        <div><b>إجمالي قيمة الحالة:</b> ${formatEgpFromCents(caseValueCents)} جنيه</div>
        <div><b>المدفوع:</b> ${formatEgpFromCents(paidSumCents)} جنيه</div>
        <div><b>المتبقي:</b> ${formatEgpFromCents(remainingCents)} جنيه</div>
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

// ---- P0-5 helpers خاصة بحقلي financeTotal/financeRemaining على ملف المريض نفسه (سكالار، مش
// عنصر في مصفوفة زي الدفعات/الرسوم — عشان كده منفصلين عن readAmountCents/writeAmountFields
// العامة في money-utils.js، بس بنفس منطق dual-write).
function readFinanceTotalCents(file){
  if(file.financeTotalCents !== undefined && file.financeTotalCents !== null) return parseInt(file.financeTotalCents, 10) || 0;
  return egpToCents(file.financeTotal);
}
function writeFinanceTotalCents(file, egpValue){
  const cents = egpToCents(egpValue);
  file.financeTotalCents = cents;
  file.financeTotal = centsToEgp(cents);
}
// null معناها "مفيش قيمة مُدخلة يدويًا" (زي الأول بالظبط: financeRemaining === undefined/null)
function readFinanceRemainingCents(file){
  if(file.financeRemainingCents !== undefined && file.financeRemainingCents !== null) return parseInt(file.financeRemainingCents, 10) || 0;
  if(file.financeRemaining === undefined || file.financeRemaining === null) return null;
  return egpToCents(file.financeRemaining);
}
function writeFinanceRemainingCents(file, egpValue){
  const cents = egpToCents(egpValue);
  file.financeRemainingCents = cents;
  file.financeRemaining = centsToEgp(cents);
}
function hasManualRemaining(file){
  return readFinanceRemainingCents(file) !== null;
}

function renderFinanceTab(){
  const file = state.currentPatientFile;
  const clinic = state.clinics.find(c=>c.id === state.currentClinicId);
  // "حالة الدكتور" — مريض جايب هو نفسه مش من خلال العيادة، فمفيش نسبة للعيادة في الحالة دي
  // تحديدًا حتى لو باقي عيانين نفس العيادة عندهم نسبة عادية. الافتراضي (لو مش متسجل) هو "أيوه
  // ليها نسبة" — نفس السلوك القديم قبل ما الخيار ده يتضاف، عشان الحالات القديمة متتأثرش.
  const clinicHasShare = file.clinicHasShare !== false;
  const commissionPct = clinicHasShare ? (clinic ? (parseFloat(clinic.commission) || 70) : 70) : 100;
  const totalCents = readFinanceTotalCents(file);
  const extras = file.financeExtras || [];
  const extrasSumCents = extras.reduce((s,e)=> s + readAmountCents(e), 0);
  const payments = file.payments || [];
  const paidSumCents = payments.reduce((s,p)=> s + readAmountCents(p), 0);
  const caseValueCents = totalCents + extrasSumCents;
  const computedRemainingCents = caseValueCents - paidSumCents;
  const manualRemainingCents = readFinanceRemainingCents(file);
  const remainingCents = manualRemainingCents !== null ? manualRemainingCents : computedRemainingCents;
  // Math.round بعد القسمة — نصيبك ونصيب العيادة لازم يجمعوا بالظبط على caseValueCents، فبنحسب
  // نصيبك مرة واحدة بالتقريب وبعدين نصيب العيادة = الباقي (مش نسبته هو كمان)، عشان مفيش قرش
  // يضيع أو يتزود بسبب تقريب مزدوج.
  const yourShareCents = Math.round(caseValueCents * commissionPct / 100);
  const clinicShareCents = caseValueCents - yourShareCents;

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
              <td>${formatEgpFromCents(readAmountCents(p))} جنيه</td>
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
              <td>${formatEgpFromCents(readAmountCents(e))} جنيه</td>
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
  // التوزيع الشهري كمان بالقروش من هنا لحد آخر لحظة عرض — بدل الجمع بالفلوت زي الأول
  const monthlyMapCents = {};
  payments.forEach(p=>{
    const ym = (p.date||'').slice(0,7);
    if(!ym) return;
    monthlyMapCents[ym] = (monthlyMapCents[ym]||0) + readAmountCents(p);
  });
  const months = Object.keys(monthlyMapCents).sort((a,b)=>b.localeCompare(a));
  const monthlyCommissionHtml = months.length ? `
    <div class="finance-tables">
      <table>
        <thead><tr><th>الشهر</th><th>المدفوع</th><th>نصيبك (${commissionPct}%)</th><th>نصيب العيادة</th></tr></thead>
        <tbody>
          ${months.map(ym=>{
            const amtCents = monthlyMapCents[ym];
            const yShareCents = Math.round(amtCents * commissionPct / 100);
            const cShareCents = amtCents - yShareCents;
            return `<tr><td>${monthLabelAr(ym)}</td><td>${formatEgpFromCents(amtCents)} جنيه</td><td>${formatEgpFromCents(yShareCents)} جنيه</td><td>${formatEgpFromCents(cShareCents)} جنيه</td></tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  ` : `<div class="placeholder" style="margin-top:8px;">لسه مفيش دفعات مسجلة بتاريخ عشان نحسب التوزيع الشهري</div>`;

  return `
    <div class="section-title">الحسابات</div>
    <div class="row" style="margin-bottom:10px;gap:8px;flex-wrap:wrap;">
      <button class="secondary small" id="printStatementBtn">🖨️ طباعة / تصدير كشف الحساب</button>
      ${file.accountSettled
        ? `<button class="secondary small" id="toggleAccountSettledBtn" style="color:var(--green);">✅ الحساب خلص${file.accountSettledDate ? ' — ' + formatDateAr(file.accountSettledDate) : ''} (دوس ترجعه لسه شغال)</button>`
        : `<button class="secondary small" id="toggleAccountSettledBtn">💰 علّم إن الحساب خلص</button>`}
    </div>
    <div class="row" style="gap:16px;">
      <div class="field" style="max-width:240px;">
        <label>التوتال المتفق عليه (بدون الإضافات)</label>
        <input type="number" id="financeTotalInput" value="${centsToEgp(totalCents)}">
      </div>
      <div class="field" style="max-width:240px;">
        <label>المتبقي ${manualRemainingCents !== null ? '(مُدخل يدويًا)' : '(محسوب تلقائيًا — عدّله يدويًا للحالات اللي بدأت قبل النظام)'}</label>
        <input type="number" id="financeRemainingInput" value="${centsToEgp(remainingCents)}">
      </div>
    </div>
    <div class="bracket-summary" style="margin-top:14px;">
      <div class="bracket-stat"><div class="num">${formatEgpFromCents(caseValueCents)}</div><div class="lbl">إجمالي قيمة الحالة</div></div>
      <div class="bracket-stat"><div class="num">${formatEgpFromCents(paidSumCents)}</div><div class="lbl">المدفوع</div></div>
      <div class="bracket-stat"><div class="num">${formatEgpFromCents(remainingCents)}</div><div class="lbl">المتبقي</div></div>
    </div>
    <div class="row" style="align-items:center;gap:8px;margin-top:14px;">
      <input type="checkbox" id="clinicHasShareCheckbox" ${clinicHasShare ? 'checked' : ''}>
      <label for="clinicHasShareCheckbox" style="margin:0;font-size:13px;cursor:pointer;">العيادة ليها نسبة في الحالة دي (بلغيها لو دي حالة الدكتور مباشرة — العيادة مالهاش نسبة فيها)</label>
    </div>
    <div class="bracket-summary">
      <div class="bracket-stat"><div class="num">${formatEgpFromCents(yourShareCents)}</div><div class="lbl">نصيبك (${commissionPct}%)</div></div>
      <div class="bracket-stat"><div class="num">${formatEgpFromCents(clinicShareCents)}</div><div class="lbl">نصيب العيادة</div></div>
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
  const oldTotal = centsToEgp(readFinanceTotalCents(file));
  writeFinanceTotalCents(file, value);
  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  await logActivity('set_finance_total', `غيّر إجمالي قيمة الحالة من ${oldTotal} إلى ${centsToEgp(readFinanceTotalCents(file))} جنيه لمريض ${patientNameForLog()}`);
  toast('اتحفظ');
  render();
}

async function toggleAccountSettled(){
  const file = state.currentPatientFile;
  if(file.accountSettled){
    file.accountSettled = false;
    file.accountSettledDate = null;
  } else {
    file.accountSettled = true;
    file.accountSettledDate = defaultRecordDate();
  }
  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  await logActivity('toggle_account_settled', `${file.accountSettled ? 'سجّل إن الحساب خلص' : 'رجّع الحساب لسه شغال'} لمريض ${patientNameForLog()}`);
  toast(file.accountSettled ? '✅ اتسجل إن الحساب خلص' : 'اتسجل إنه لسه شغال');
  render();
}

// once the doctor manually sets/overrides this, it becomes the source of truth for "المتبقي"
// (instead of the auto-computed total+extras-paid) — payments/extras from then on adjust it
// directly rather than it being recalculated from scratch. Needed for patients who started
// before the system existed, where the true remaining balance isn't derivable from what's
// logged in the system.
async function updateFinanceRemaining(value){
  const file = state.currentPatientFile;
  writeFinanceRemainingCents(file, value);
  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  await logActivity('set_remaining', `حدّد المتبقي يدويًا (${centsToEgp(readFinanceRemainingCents(file))} جنيه) لمريض ${patientNameForLog()}`);
  toast('اتحفظ');
  render();
}

async function toggleClinicHasShare(hasShare){
  const file = state.currentPatientFile;
  file.clinicHasShare = hasShare;
  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  await logActivity('set_clinic_share', `${hasShare ? 'رجّع نسبة العيادة' : 'ألغى نسبة العيادة (حالة الدكتور)'} لمريض ${patientNameForLog()}`);
  toast(hasShare ? 'العيادة بقى ليها نسبة في الحالة دي' : 'اتسجلت كحالة دكتور — مفيش نسبة للعيادة');
  render();
}

function openAddPaymentModal(){
  const today = defaultRecordDate();
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `
    <div class="modal">
      <h3>تسجيل دفعة</h3>
      <div class="field"><label>المبلغ</label><input type="number" id="newPaymentAmount"></div>
      <div class="field"><label>التاريخ</label><input type="date" id="newPaymentDate" value="${today}">${defaultDateHintHtml(today)}</div>
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
    const rawAmount = document.getElementById('newPaymentAmount').value;
    const amountCents = egpToCents(rawAmount);
    const date = document.getElementById('newPaymentDate').value || today;
    const note = document.getElementById('newPaymentNote').value.trim();
    if(amountCents <= 0){ toast('اكتب مبلغ صحيح'); return; }
    const file = state.currentPatientFile;
    if(!file.payments) file.payments = [];
    file.payments.push(writeAmountFields({ id: uid(), date, note }, rawAmount));
    if(hasManualRemaining(file)){
      writeFinanceRemainingCents(file, centsToEgp(readFinanceRemainingCents(file) - amountCents));
    }
    await savePatientFile(state.currentPatientId, stripHelperFields(file));
    await logActivity('add_payment', `أضاف دفعة ${centsToEgp(amountCents)} جنيه لمريض ${patientNameForLog()}`);
    bg.remove();
    render();
  };
  setTimeout(()=>document.getElementById('newPaymentAmount').focus(), 50);
}

function openAddExtraModal(){
  const today = defaultRecordDate();
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `
    <div class="modal">
      <h3>إضافة رسوم إضافية</h3>
      <div class="field"><label>السبب</label><input type="text" id="newExtraReason" placeholder="مثلاً: تغيير سلك"></div>
      <div class="field"><label>المبلغ</label><input type="number" id="newExtraAmount"></div>
      <div class="field"><label>التاريخ</label><input type="date" id="newExtraDate" value="${today}">${defaultDateHintHtml(today)}</div>
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
    const rawAmount = document.getElementById('newExtraAmount').value;
    const amountCents = egpToCents(rawAmount);
    const date = document.getElementById('newExtraDate').value || today;
    if(!reason){ toast('اكتب السبب'); return; }
    if(amountCents <= 0){ toast('اكتب مبلغ صحيح'); return; }
    const file = state.currentPatientFile;
    if(!file.financeExtras) file.financeExtras = [];
    file.financeExtras.push(writeAmountFields({ id: uid(), reason, date }, rawAmount));
    if(hasManualRemaining(file)){
      writeFinanceRemainingCents(file, centsToEgp(readFinanceRemainingCents(file) + amountCents));
    }
    await savePatientFile(state.currentPatientId, stripHelperFields(file));
    await logActivity('add_extra', `أضاف رسوم إضافية "${reason}" (${centsToEgp(amountCents)} جنيه) لمريض ${patientNameForLog()}`);
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
      <div class="field"><label>المبلغ</label><input type="number" id="editPaymentAmount" value="${centsToEgp(readAmountCents(p))}"></div>
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
    const rawAmount = document.getElementById('editPaymentAmount').value;
    const newCents = egpToCents(rawAmount);
    const date = document.getElementById('editPaymentDate').value || p.date;
    const note = document.getElementById('editPaymentNote').value.trim();
    if(newCents <= 0){ toast('اكتب مبلغ صحيح'); return; }
    const oldCents = readAmountCents(p);
    if(hasManualRemaining(file)){
      writeFinanceRemainingCents(file, centsToEgp(readFinanceRemainingCents(file) + oldCents - newCents));
    }
    writeAmountFields(p, rawAmount); p.date = date; p.note = note;
    await savePatientFile(state.currentPatientId, stripHelperFields(file));
    await logActivity('edit_payment', `عدّل دفعة (${centsToEgp(newCents)} جنيه) لمريض ${patientNameForLog()}`);
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
      <div class="field"><label>المبلغ</label><input type="number" id="editExtraAmount" value="${centsToEgp(readAmountCents(ex))}"></div>
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
    const rawAmount = document.getElementById('editExtraAmount').value;
    const newCents = egpToCents(rawAmount);
    const date = document.getElementById('editExtraDate').value || ex.date;
    if(!reason){ toast('اكتب السبب'); return; }
    if(newCents <= 0){ toast('اكتب مبلغ صحيح'); return; }
    const oldCents = readAmountCents(ex);
    if(hasManualRemaining(file)){
      writeFinanceRemainingCents(file, centsToEgp(readFinanceRemainingCents(file) - oldCents + newCents));
    }
    const oldReason = ex.reason;
    ex.reason = reason; writeAmountFields(ex, rawAmount); ex.date = date;
    await savePatientFile(state.currentPatientId, stripHelperFields(file));
    await logActivity('edit_extra', `عدّل رسوم إضافية "${oldReason}" من ${centsToEgp(oldCents)} إلى ${centsToEgp(newCents)} جنيه لمريض ${patientNameForLog()}`);
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
  if(p && hasManualRemaining(file)){
    writeFinanceRemainingCents(file, centsToEgp(readFinanceRemainingCents(file) + readAmountCents(p)));
  }
  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  await logActivity('delete_payment', `حذف دفعة (${p ? centsToEgp(readAmountCents(p)) : '?'} جنيه) من مريض ${patientNameForLog()}`);
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

  const removedExtra = (file.financeExtras||[]).find(e=>e.id === id);

  // لو الرسوم دي جايه من كسر فص وهيترجع مخزون، لازم نتأكد إن الحفظ ده نجح الأول — زي بالظبط
  // deleteBreakEntry في hygiene-stages-bracketmap.js — عشان منمسحش سجل الكسر والرسوم بناءً على
  // إرجاع مخزون اتلغى (تعارض/أوفلاين)
  let inventoryChanged = false;
  if(isBreakCharge){
    const bm = ensureBracketMap(file);
    Object.values(bm.teeth).forEach(t=>{
      const idx = t.breaks.findIndex(b=>b.id===id);
      if(idx>-1) t.breaks.splice(idx,1);
    });
    (file.monthlyLog||[]).forEach(entry=>{
      if(!entry.materialsUsed) return;
      const linked = entry.materialsUsed.find(u=>u.linkedBreakId === id);
      if(linked){
        const item = state.inventory.find(i=>i.id === linked.itemId);
        if(item){ item.qty = (parseFloat(item.qty)||0) + (parseFloat(linked.qty)||0); inventoryChanged = true; }
        entry.materialsUsed = entry.materialsUsed.filter(u=>u.linkedBreakId !== id);
      }
    });
    if(inventoryChanged){
      const okInv = await saveInventory();
      if(!okInv){ render(); return; }
    }
  }

  file.financeExtras = (file.financeExtras||[]).filter(e=>e.id !== id);
  if(removedExtra && hasManualRemaining(file)){
    writeFinanceRemainingCents(file, centsToEgp(readFinanceRemainingCents(file) - readAmountCents(removedExtra)));
  }

  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  await logActivity('delete_extra', `حذف رسوم إضافية "${removedExtra ? removedExtra.reason : ''}" (${removedExtra ? centsToEgp(readAmountCents(removedExtra)) : '?'} جنيه) من مريض ${patientNameForLog()}`);
  render();
}

function attachFinanceHandlers(){
  const printBtn = document.getElementById('printStatementBtn');
  if(printBtn) printBtn.onclick = () => printPatientStatement();
  const settledBtn = document.getElementById('toggleAccountSettledBtn');
  if(settledBtn) settledBtn.onclick = () => toggleAccountSettled();
  const totalInput = document.getElementById('financeTotalInput');
  if(totalInput) totalInput.onchange = () => updateFinanceTotal(totalInput.value);
  const remainingInput = document.getElementById('financeRemainingInput');
  if(remainingInput) remainingInput.onchange = () => updateFinanceRemaining(remainingInput.value);
  const clinicShareCheckbox = document.getElementById('clinicHasShareCheckbox');
  if(clinicShareCheckbox) clinicShareCheckbox.onchange = () => toggleClinicHasShare(clinicShareCheckbox.checked);
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
