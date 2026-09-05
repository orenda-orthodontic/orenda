// patients-view.js — شاشة قائمة المرضى (فيها Pagination)
// ============ PATIENTS VIEW ============
// Rendering the full patient list as DOM on every keystroke/re-render gets slow once a clinic has
// a few hundred patients. Only the first PATIENT_LIST_PAGE_SIZE (post-search) are rendered; a
// "عرض المزيد" button reveals more in batches instead of building every <li> up front.
const PATIENT_LIST_PAGE_SIZE = 40;
function renderPatientListHtml(){
  const term = state.searchTerm.trim().toLowerCase();
  let list = state.patients.filter(p => !term || p.name.toLowerCase().includes(term) || (p.number||'').includes(term));

  if(state.patientSortMode === 'number'){
    list = [...list].sort((a,b)=> (parseInt(a.number,10)||0) - (parseInt(b.number,10)||0) || a.name.localeCompare(b.name,'ar'));
  } else {
    list = [...list].sort((a,b)=> a.name.localeCompare(b.name, 'ar'));
  }

  if(!list.length){
    return `<div class="empty-state">${state.patients.length ? 'مفيش نتائج للبحث ده' : 'لسه مفيش مرضى في العيادة دي'}</div>`;
  }
  const visibleCount = state.patientListVisibleCount || PATIENT_LIST_PAGE_SIZE;
  const total = list.length;
  const visibleList = list.slice(0, visibleCount);
  let lastLetter = null;
  let html = '<ul class="patient-list">';
  visibleList.forEach(p=>{
    if(state.patientSortMode === 'alpha'){
      const letter = p.name.trim()[0];
      if(letter !== lastLetter){
        html += `<li class="letter-heading">${letter}</li>`;
        lastLetter = letter;
      }
    }
    const missed = state.clinicMissedStatus ? (state.clinicMissedStatus[p.id] || 0) : 0;
    const bracketType = state.clinicBracketTypes ? (state.clinicBracketTypes[p.id] || '') : '';
    html += `
      <li class="patient-item" data-id="${p.id}">
        <div>
          <div class="pname">${escapeHtml(p.name)}</div>
          <div class="pnum">رقم: ${escapeHtml(p.number || '-')}</div>
          <div class="pcontact">
            ${p.phone ? `<a class="wa-btn small" data-wa-link href="${buildWhatsappLinkWithText(p.phone, buildPatientGreetingMessage(p))}" target="_blank" rel="noopener">💬 ${escapeHtml(p.phone)}</a>` : `<span class="pmeta">مفيش رقم موبايل</span>`}
            <span class="pmeta">نوع البراكيت: ${bracketSystemLabel(bracketType)}</span>
          </div>
          ${missed >= MISSED_MONTHS_ALERT_THRESHOLD ? `<div style="margin-top:4px;"><span class="appt-badge overdue stock-alert-blink">⚠ مجاش من ${missed} شهر</span></div>` : ''}
        </div>
        <div style="color:var(--muted);font-size:18px;">‹</div>
      </li>
    `;
  });
  html += '</ul>';
  if(total > visibleList.length){
    html += `<button class="secondary" id="patientListShowMoreBtn" style="width:100%;margin-top:10px;">عرض المزيد (${total - visibleList.length} باقي)</button>`;
  }
  return html;
}

function attachPatientListHandlers(){
  document.querySelectorAll('.patient-item').forEach(el=>{
    el.onclick = async () => {
      state.currentPatientId = el.dataset.id;
      state.view = 'patient';
      state.activeTab = 'overview';
      await loadInventory();
      render();
    };
  });
  document.querySelectorAll('[data-wa-link]').forEach(el=>{
    el.onclick = (e) => { e.stopPropagation(); };
  });
  const showMoreBtn = document.getElementById('patientListShowMoreBtn');
  if(showMoreBtn){
    showMoreBtn.onclick = () => {
      state.patientListVisibleCount = (state.patientListVisibleCount || PATIENT_LIST_PAGE_SIZE) + PATIENT_LIST_PAGE_SIZE;
      const container = document.getElementById('patientListContainer');
      if(container){
        container.innerHTML = renderPatientListHtml();
        attachPatientListHandlers();
      }
    };
  }
}

function renderPatientsView(){
  const clinic = state.clinics.find(c=>c.id === state.currentClinicId);
  const commissionPct = clinic ? (parseFloat(clinic.commission) || 70) : 70;
  const summaryMonth = state.clinicSummaryMonth || currentMonthStr();
  const summaryTotal = state.clinicSummaryTotal || 0;
  const summaryYourShare = summaryTotal * (commissionPct/100);
  const summaryClinicShare = summaryTotal - summaryYourShare;
  const summaryHtml = state.clinicSummaryLoading ? `
    <div class="placeholder" style="margin-top:10px;">جارِ الحساب...</div>
  ` : `
    <div class="bracket-summary" style="margin-top:10px;">
      <div class="bracket-stat"><div class="num">${summaryTotal.toLocaleString()}</div><div class="lbl">إجمالي المدفوع</div></div>
      <div class="bracket-stat"><div class="num">${summaryYourShare.toLocaleString()}</div><div class="lbl">نصيبك (${commissionPct}%)</div></div>
      <div class="bracket-stat"><div class="num">${summaryClinicShare.toLocaleString()}</div><div class="lbl">نصيب العيادة</div></div>
    </div>
  `;

  return `
    <div class="breadcrumb">
      <span class="crumb" id="crumbClinics">العيادات</span>
      <span class="sep">/</span>
      <span>${escapeHtml(clinic ? clinic.name : '')}</span>
    </div>
    <div class="card">
      <div class="row" style="justify-content:space-between;flex-wrap:wrap;">
        <div class="section-title" style="margin:0;">إجمالي المدفوع هذا الشهر (كل المرضى)</div>
        <input type="month" id="clinicSummaryMonth" value="${escapeHtml(summaryMonth)}">
      </div>
      ${summaryHtml}
    </div>
    <div class="top-actions">
      <button id="addPatientBtn">+ إضافة مريض</button>
      <button class="secondary${(state.clinicMissedStatus && Object.values(state.clinicMissedStatus).some(m=>m>=MISSED_MONTHS_ALERT_THRESHOLD)) ? ' btn-stock-alert' : ''}" id="toggleSortBtn">↕ ترتيب: ${state.patientSortMode==='number' ? 'بالأرقام' : 'أبجدي'}${(state.clinicMissedStatus && Object.values(state.clinicMissedStatus).some(m=>m>=MISSED_MONTHS_ALERT_THRESHOLD)) ? ' <span style="color:#f5b700;">⚠</span>' : ''}</button>
      <button class="secondary" id="editClinicBtn">تعديل نسبة العيادة</button>
      <button class="secondary" id="openClinicAnalysisBtn">📊 تحليل الشهر</button>
    </div>
    <div class="card">
      <input type="text" id="searchPatient" placeholder="بحث بالاسم أو الرقم..." value="${escapeHtml(state.searchTerm)}" style="width:100%;margin-bottom:12px;">
      <div id="patientListContainer">${renderPatientListHtml()}</div>
    </div>
  `;
}

function attachPatientsHandlers(){
  document.getElementById('crumbClinics').onclick = async () => {
    state.view = 'clinics';
    render();
  };
  document.getElementById('addPatientBtn').onclick = () => openPatientModal();
  document.getElementById('toggleSortBtn').onclick = () => {
    state.patientSortMode = state.patientSortMode === 'number' ? 'alpha' : 'number';
    state.patientListVisibleCount = PATIENT_LIST_PAGE_SIZE;
    render();
  };
  document.getElementById('editClinicBtn').onclick = () => openEditClinicModal();
  document.getElementById('openClinicAnalysisBtn').onclick = async () => {
    state.view = 'clinicAnalysis';
    if(!state.clinicAnalysisMonth) state.clinicAnalysisMonth = currentMonthStr();
    state.clinicAnalysisLoading = true;
    render();
    await loadClinicAnalysisData(state.currentClinicId, state.clinicAnalysisMonth);
    render();
  };
  const monthInput = document.getElementById('clinicSummaryMonth');
  if(monthInput) monthInput.onchange = async () => {
    state.clinicSummaryMonth = monthInput.value;
    state.clinicSummaryLoading = true;
    render();
    await loadClinicPatientAggregates(state.currentClinicId, state.clinicSummaryMonth);
    render();
  };
  const search = document.getElementById('searchPatient');
  search.oninput = () => {
    state.searchTerm = search.value;
    state.patientListVisibleCount = PATIENT_LIST_PAGE_SIZE;
    const container = document.getElementById('patientListContainer');
    if(container){
      container.innerHTML = renderPatientListHtml();
      attachPatientListHandlers();
    }
  };
  attachPatientListHandlers();
}

const AR_MONTHS_FULL = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
function monthLabelAr(ym){
  const [y,m] = (ym||'').split('-');
  const idx = parseInt(m,10) - 1;
  return (AR_MONTHS_FULL[idx] || m) + ' ' + y;
}

function renderClinicAnalysisView(){
  const clinic = state.clinics.find(c=>c.id === state.currentClinicId);
  const commissionPct = clinic ? (parseFloat(clinic.commission) || 70) : 70;
  const month = state.clinicAnalysisMonth || currentMonthStr();
  const data = state.clinicAnalysisData;

  let bodyHtml;
  if(state.clinicAnalysisLoading || !data || data.month !== month){
    bodyHtml = `<div class="placeholder" style="margin-top:10px;">جارِ التحليل...</div>`;
  } else {
    const yourShare = data.incomeThisMonth * (commissionPct/100);
    const clinicShare = data.incomeThisMonth - yourShare;
    const trendPct = data.avgPrev3 > 0 ? Math.round(((data.incomeThisMonth - data.avgPrev3)/data.avgPrev3)*100) : null;

    const alertsHtml = data.alerts.length ? `
      <div class="card" style="background:#fff3f0;border-color:var(--red);margin-bottom:14px;">
        ${data.alerts.map(a=>`<div class="bracket-alert" style="margin-bottom:6px;">${escapeHtml(a)}</div>`).join('')}
      </div>
    ` : '';

    const patientChips = (list) => list.length
      ? `<div class="stage-tags">${list.map(p=>`<span class="stage-date-chip">${escapeHtml(p.name)} <span style="color:var(--muted);">(${(p.thisAmt||0).toLocaleString()} جنيه)</span></span>`).join('')}</div>`
      : `<div class="placeholder" style="padding:6px 0;">لا يوجد</div>`;

    const newCasesHtml = data.newCases.length
      ? `<div class="stage-tags">${data.newCases.map(nc=>`<span class="stage-date-chip">🆕 ${escapeHtml(nc.name)} — ${formatDateAr(nc.date)}</span>`).join('')}</div>`
      : `<div class="placeholder" style="padding:6px 0;">مفيش حالات جديدة الشهر ده</div>`;

    bodyHtml = `
      ${alertsHtml}
      <div class="card" style="margin-bottom:14px;">
        <div class="section-title" style="margin:0 0 8px;">دخل الشهر</div>
        <div class="bracket-summary">
          <div class="bracket-stat"><div class="num">${data.incomeThisMonth.toLocaleString()}</div><div class="lbl">إجمالي المدفوع</div></div>
          <div class="bracket-stat"><div class="num">${yourShare.toLocaleString()}</div><div class="lbl">نصيبك (${commissionPct}%)</div></div>
          <div class="bracket-stat"><div class="num">${clinicShare.toLocaleString()}</div><div class="lbl">نصيب العيادة</div></div>
        </div>
        ${trendPct !== null ? `<div class="psub" style="margin-top:8px;">مقارنة بمتوسط آخر 3 شهور (${Math.round(data.avgPrev3).toLocaleString()} جنيه): <b style="color:${trendPct<0?'var(--red)':'inherit'};">${trendPct>0?'+':''}${trendPct}%</b></div>` : ''}
      </div>
      <div class="card" style="margin-bottom:14px;">
        <div class="section-title" style="margin:0 0 8px;">حالات جديدة الشهر ده (${data.newCases.length})</div>
        ${newCasesHtml}
      </div>
      <div class="card" style="margin-bottom:14px;">
        <div class="section-title" style="margin:0 0 8px;">استقرار المرضى (مقارنة بمتوسط دفعاتهم في آخر 3 شهور)</div>
        <div class="lbl">✅ مستقر</div>
        ${patientChips(data.groups.stable)}
        <div class="lbl" style="margin-top:10px;">📈 بيزيد</div>
        ${patientChips(data.groups.up)}
        <div class="lbl" style="margin-top:10px;color:var(--red);">📉 نازل</div>
        ${patientChips(data.groups.down)}
        <div class="lbl" style="margin-top:10px;color:var(--red);">⛔ متوقف الشهر ده</div>
        ${patientChips(data.groups.stopped)}
      </div>
    `;
  }

  return `
    <div class="breadcrumb">
      <span class="crumb" id="crumbClinics3">العيادات</span>
      <span class="sep">/</span>
      <span class="crumb" id="crumbPatients2">${escapeHtml(clinic ? clinic.name : '')}</span>
      <span class="sep">/</span>
      <span>تحليل الشهر</span>
    </div>
    <div class="card">
      <div class="row" style="justify-content:space-between;flex-wrap:wrap;">
        <div class="section-title" style="margin:0;">تحليل شهر ${monthLabelAr(month)}</div>
        <input type="month" id="clinicAnalysisMonthInput" value="${escapeHtml(month)}">
      </div>
    </div>
    ${bodyHtml}
  `;
}

function attachClinicAnalysisHandlers(){
  document.getElementById('crumbClinics3').onclick = () => { state.view = 'clinics'; render(); };
  document.getElementById('crumbPatients2').onclick = () => { state.view = 'patients'; render(); };
  const monthInput = document.getElementById('clinicAnalysisMonthInput');
  if(monthInput){
    monthInput.onchange = async () => {
      state.clinicAnalysisMonth = monthInput.value;
      state.clinicAnalysisLoading = true;
      render();
      await loadClinicAnalysisData(state.currentClinicId, state.clinicAnalysisMonth);
      render();
    };
  }
}

function openPatientModal(){
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `
    <div class="modal">
      <h3>إضافة مريض جديد</h3>
      <div class="field">
        <label>الاسم</label>
        <input type="text" id="newPatientName" placeholder="اسم المريض">
      </div>
      <div class="field">
        <label>رقم الموبايل (لإرسال واتساب)</label>
        <input type="text" id="newPatientPhone" placeholder="01xxxxxxxxx">
      </div>
      <div class="field">
        <label style="color:var(--muted)">الرقم هيتحدد تلقائي</label>
      </div>
      <div class="modal-actions">
        <button class="secondary" id="cancelPatientBtn">إلغاء</button>
        <button id="savePatientBtn">حفظ</button>
      </div>
    </div>
  `;
  document.body.appendChild(bg);
  document.getElementById('cancelPatientBtn').onclick = () => bg.remove();
  bg.onclick = (e) => { if(e.target === bg) bg.remove(); };
  document.getElementById('savePatientBtn').onclick = async () => {
    const name = document.getElementById('newPatientName').value.trim();
    if(!name){ toast('اكتب اسم المريض'); return; }
    const clinic = state.clinics.find(c=>c.id === state.currentClinicId);
    const nextNum = (clinic.nextPatientNumber || 1);
    clinic.nextPatientNumber = nextNum + 1;
    const phone = document.getElementById('newPatientPhone').value.trim();
    const id = uid();
    state.patients.push({ id, name, number: String(nextNum), phone });
    await setData('patients:' + state.currentClinicId, state.patients);
    await setData('clinics', state.clinics);
    await logActivity('add_patient', `أضاف مريض جديد: ${name} (رقم ${nextNum})`);
    bg.remove();
    toast('اتضاف المريض برقم ' + nextNum);
    render();
  };
  setTimeout(()=>document.getElementById('newPatientName').focus(), 50);
}

function openEditClinicModal(){
  const clinic = state.clinics.find(c=>c.id === state.currentClinicId);
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `
    <div class="modal">
      <h3>تعديل نسبة العيادة</h3>
      <div class="field">
        <label>نسبتك من الحالة (%)</label>
        <input type="number" id="editCommission" value="${clinic.commission ?? 70}" min="0" max="100">
      </div>
      <div class="modal-actions">
        <button class="secondary" id="cancelEditClinicBtn">إلغاء</button>
        <button id="saveEditClinicBtn">حفظ</button>
      </div>
    </div>
  `;
  document.body.appendChild(bg);
  document.getElementById('cancelEditClinicBtn').onclick = () => bg.remove();
  bg.onclick = (e) => { if(e.target === bg) bg.remove(); };
  document.getElementById('saveEditClinicBtn').onclick = async () => {
    clinic.commission = parseFloat(document.getElementById('editCommission').value) || 70;
    await setData('clinics', state.clinics);
    bg.remove();
    toast('اتحدثت النسبة');
    render();
  };
}

