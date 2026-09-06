// patient-shell.js — الهيكل العام لملف المريض (تابات، هيدر)
// ============ PATIENT VIEW (shell for future sections) ============
async function renderPatientView(){
  const clinic = state.clinics.find(c=>c.id === state.currentClinicId);
  const patient = state.patients.find(p=>p.id === state.currentPatientId);
  if(!patient){
    return `<div class="empty-state">المريض مش موجود</div>`;
  }
  if(!state.currentPatientFile || state.currentPatientFile._id !== patient.id){
    state.currentPatientFile = await loadPatientFile(patient.id);
    state.currentPatientFile._id = patient.id;
  }
  const file = state.currentPatientFile;

  const tabs = [
    {id:'overview', label:'نظرة عامة'},
    {id:'diagnosis', label:'التشخيص والخطة'},
    {id:'monthly', label:'المتابعة الشهرية'},
    {id:'photos', label:'الصور'},
    {id:'brackets', label:'خريطة الفصوص'},
    {id:'stages', label:'مراحل العلاج'},
    {id:'hygiene', label:'نظافة الأسنان'},
    {id:'finance', label:'الحسابات'},
  ];

  const tabsHtml = tabs.map(t => `<div class="tab ${state.activeTab===t.id?'active':''}" data-tab="${t.id}">${t.label}</div>`).join('');

  let bodyHtml = '';
  if(state.activeTab === 'overview'){
    bodyHtml = renderOverviewTab();
  } else if(state.activeTab === 'diagnosis'){
    bodyHtml = renderDiagnosisTab();
  } else if(state.activeTab === 'monthly'){
    bodyHtml = renderMonthlyTab();
  } else if(state.activeTab === 'photos'){
    await refreshPhotoUrlCache(collectPhotoPaths(ensurePhotos(file)));
    bodyHtml = renderPhotosTab();
  } else if(state.activeTab === 'brackets'){
    bodyHtml = renderBracketsTab();
  } else if(state.activeTab === 'stages'){
    bodyHtml = renderStagesTab();
  } else if(state.activeTab === 'hygiene'){
    bodyHtml = renderHygieneTab();
  } else if(state.activeTab === 'finance'){
    bodyHtml = renderFinanceTab();
  }

  return `
    <div class="breadcrumb">
      <span class="crumb" id="crumbClinics2">العيادات</span>
      <span class="sep">/</span>
      <span class="crumb" id="crumbPatients">${escapeHtml(clinic ? clinic.name : '')}</span>
      <span class="sep">/</span>
      <span>${escapeHtml(patient.name)}</span>
    </div>
    <div class="card">
      <div class="patient-header">
        <div>
          <div class="pbig">${escapeHtml(patient.name)}</div>
          <div class="psub">رقم: ${escapeHtml(patient.number || '-')}</div>
          <div class="psub">${patient.phone ? `<a class="wa-btn small" data-wa-link href="${buildWhatsappLinkWithText(patient.phone, buildPatientGreetingMessage(patient))}" target="_blank" rel="noopener">💬 ${escapeHtml(patient.phone)}</a>` : 'مفيش رقم موبايل'}</div>
          <div class="psub">نوع البراكيت: <b>${bracketSystemLabel(file.bracketSystem)}</b> <button class="secondary small" id="editBracketSystemBtn" style="padding:2px 8px;">تغيير</button></div>
          ${computeMissedMonths(file) >= MISSED_MONTHS_ALERT_THRESHOLD ? `<div class="psub" style="margin-top:6px;"><span class="appt-badge overdue stock-alert-blink">⚠ مجاش من ${computeMissedMonths(file)} شهر</span></div>` : ''}
          ${(file.newCaseEvents||[]).length ? `<div class="psub" style="margin-top:4px;">🆕 حالات جديدة مسجلة: ${file.newCaseEvents.length} (آخرها ${formatDateAr([...file.newCaseEvents].sort((a,b)=>(b.date||'').localeCompare(a.date||''))[0].date)})</div>` : ''}
          ${(file.caseStatus||'active') === 'debonded' ? `
            <div class="psub" style="margin-top:4px;">🔓 الحالة فكت${file.debondDate ? ' — ' + formatDateAr(file.debondDate) : ''}</div>
          ` : (() => {
            const startDate = computeCaseStartDate(file);
            if(!startDate) return '';
            const months = monthsSince(startDate);
            const long = months >= CASE_LONG_DURATION_MONTHS;
            return `<div class="psub${long?' stock-alert-blink':''}" style="margin-top:4px;${long?'color:var(--red);':''}">⏱ في العلاج من ${formatDateAr(startDate)} (${months} شهر)${long?' ⚠ أكتر من سنة ونص':''}</div>`;
          })()}
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap;">
          <button class="secondary small" id="markNewCaseBtn">🆕 حالة جديدة</button>
          ${(file.caseStatus||'active') === 'debonded'
            ? `<button class="secondary small" id="reactivateCaseBtn">↩️ رجّع الحالة نشطة</button>`
            : `<button class="secondary small" id="markDebondedBtn">🔓 الحالة فكت</button>`}
          <button class="secondary small" id="editCaseStartBtn">⏱ تعديل تاريخ بداية الحالة</button>
          <button class="secondary small" id="editPatientBtn">تعديل البيانات</button>
        </div>
      </div>
    </div>
    <div class="tabs">${tabsHtml}</div>
    <div class="card">${bodyHtml}</div>
  `;
}

function findDiagSection(file, title){
  return (file.diagnosisSections||[]).find(s=>s.title===title);
}
function findDiagField(section, label){
  if(!section) return '';
  const f = (section.fields||[]).find(x=>x.label===label);
  return f ? (f.value||'') : '';
}

function renderOverviewTab(){
  const file = state.currentPatientFile;

  const chief = findDiagSection(file, 'Chief Complaint');
  const chiefText = chief ? (chief.content||'') : '';

  const txPlan = findDiagSection(file, 'Treatment Plan');
  const extraction = findDiagField(txPlan, 'Extraction / Non-extraction');
  const upperPlan = findDiagField(txPlan, 'Upper plan');
  const lowerPlan = findDiagField(txPlan, 'Lower plan');

  const spaceAnchor = findDiagSection(file, 'Space Management / Anchorage');
  const anchorage = findDiagField(spaceAnchor, 'Anchorage');

  const log = file.monthlyLog || [];
  const sortedLog = [...log].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const lastEntry = sortedLog[0] || null;
  const lastDoneText = lastEntry
    ? [lastEntry.doneUpper, lastEntry.doneLower, lastEntry.doneBoth !== undefined ? lastEntry.doneBoth : lastEntry.done].filter(Boolean).join(' | ')
    : '';
  const lastHygieneEntry = sortedLog.find(e=>e.hygieneRating);
  const lastPlanText = lastEntry
    ? [lastEntry.planUpper, lastEntry.planLower, lastEntry.planBoth !== undefined ? lastEntry.planBoth : lastEntry.plan].filter(Boolean).join(' | ')
    : '';

  const bm = ensureBracketMap(file);
  const allNums = [...FDI_TEETH_ROWS.upper, ...FDI_TEETH_ROWS.lower];
  const brokenNow = allNums.filter(n=>bm.teeth[n].status==='broken').length;

  const total = parseFloat(file.financeTotal) || 0;
  const extrasSum = (file.financeExtras||[]).reduce((s,e)=>s+(parseFloat(e.amount)||0),0);
  const paidSum = (file.payments||[]).reduce((s,p)=>s+(parseFloat(p.amount)||0),0);
  const caseValue = total + extrasSum;
  const remaining = caseValue - paidSum;

  const stageCounts = computeStageCounts(file);
  let lastStageLabel = '', lastStageDate = '';
  TREATMENT_STAGES.forEach(st=>{
    (stageCounts[st.id]||[]).forEach(e=>{
      if(!lastStageDate || (e.date||'') > lastStageDate){ lastStageDate = e.date||''; lastStageLabel = st.label; }
    });
  });

  return `
    <div class="overview-grid">
      <div class="overview-card">
        <div class="overview-card-title">خطة العلاج</div>
        ${chiefText ? `<div class="overview-row"><span class="ov-lbl">Chief Complaint</span><span class="ov-val">${escapeHtml(chiefText)}</span></div>` : ''}
        <div class="overview-row"><span class="ov-lbl">خلع / بدون خلع</span><span class="ov-val">${extraction ? escapeHtml(extraction) : '—'}</span></div>
        <div class="overview-row"><span class="ov-lbl">Upper plan</span><span class="ov-val">${upperPlan ? escapeHtml(upperPlan) : '—'}</span></div>
        <div class="overview-row"><span class="ov-lbl">Lower plan</span><span class="ov-val">${lowerPlan ? escapeHtml(lowerPlan) : '—'}</span></div>
        <div class="overview-row"><span class="ov-lbl">Anchorage</span><span class="ov-val">${anchorage ? escapeHtml(anchorage) : '—'}</span></div>
      </div>

      <div class="overview-card">
        <div class="overview-card-title">آخر متابعة</div>
        ${lastEntry ? `
          <div class="overview-row"><span class="ov-lbl">التاريخ</span><span class="ov-val">${escapeHtml(lastEntry.date||'')}</span></div>
          <div class="overview-row"><span class="ov-lbl">اللي اتعمل</span><span class="ov-val">${escapeHtml(lastDoneText || '—')}</span></div>
        ` : `<div class="placeholder">لسه مفيش متابعة مسجلة</div>`}
        ${lastHygieneEntry ? `<div class="overview-row"><span class="ov-lbl">آخر تقييم نظافة</span><span class="ov-val"><span class="hygiene-chip ${HYGIENE_CLASS[lastHygieneEntry.hygieneRating]}">${HYGIENE_LABELS[lastHygieneEntry.hygieneRating]}</span></span></div>` : ''}
      </div>

      <div class="overview-card">
        <div class="overview-card-title">خطة الزيارة الجاية</div>
        ${lastPlanText ? `
          <div class="overview-row"><span class="ov-lbl">بتاريخ</span><span class="ov-val">${escapeHtml(lastEntry.date||'')}</span></div>
          <div class="overview-row"><span class="ov-lbl">الخطة</span><span class="ov-val">${escapeHtml(lastPlanText)}</span></div>
        ` : `<div class="placeholder">لسه مفيش خطة مسجلة</div>`}
      </div>

      <div class="overview-card">
        <div class="overview-card-title">خريطة الفصوص</div>
        <div class="overview-row"><span class="ov-lbl">مكسور حاليًا</span><span class="ov-val ${brokenNow>0?'ov-alert':''}">${brokenNow}</span></div>
      </div>

      <div class="overview-card">
        <div class="overview-card-title">الحسابات</div>
        <div class="overview-row"><span class="ov-lbl">الإجمالي</span><span class="ov-val">${caseValue.toLocaleString()} جنيه</span></div>
        <div class="overview-row"><span class="ov-lbl">المحصّل</span><span class="ov-val">${paidSum.toLocaleString()} جنيه</span></div>
        <div class="overview-row"><span class="ov-lbl">الباقي</span><span class="ov-val ${remaining>0?'ov-alert':''}">${remaining.toLocaleString()} جنيه</span></div>
      </div>

      <div class="overview-card">
        <div class="overview-card-title">مراحل العلاج</div>
        ${lastStageLabel ? `<div class="overview-row"><span class="ov-lbl">آخر مرحلة</span><span class="ov-val">${escapeHtml(lastStageLabel)} (${escapeHtml(lastStageDate)})</span></div>` : `<div class="placeholder">لسه مفيش مرحلة متسجلة</div>`}
      </div>
    </div>
  `;
}

function bracketSystemLabel(v){
  if(v === 'roth') return 'ROTH';
  if(v === 'mbt') return 'MBT';
  return 'غير محدد ⚠';
}

function openEditBracketSystemModal(){
  const file = state.currentPatientFile;
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `
    <div class="modal">
      <h3>نوع البراكيت</h3>
      <div class="placeholder" style="padding:8px;margin-bottom:8px;">بيتحدد بيه مخزن الريفيل اللي هيتخصم منه أوتوماتيك لما تكتب "rebonding" أو "فص" في المتابعة الشهرية</div>
      <div class="field">
        <label>النوع</label>
        <select id="editBracketSystemSelect">
          <option value="" ${!file.bracketSystem?'selected':''}>غير محدد</option>
          <option value="roth" ${file.bracketSystem==='roth'?'selected':''}>ROTH</option>
          <option value="mbt" ${file.bracketSystem==='mbt'?'selected':''}>MBT</option>
        </select>
      </div>
      <div class="modal-actions">
        <button class="secondary" id="cancelBracketSystemBtn">إلغاء</button>
        <button id="saveBracketSystemBtn">حفظ</button>
      </div>
    </div>
  `;
  document.body.appendChild(bg);
  document.getElementById('cancelBracketSystemBtn').onclick = () => bg.remove();
  bg.onclick = (e) => { if(e.target === bg) bg.remove(); };
  document.getElementById('saveBracketSystemBtn').onclick = async () => {
    const val = document.getElementById('editBracketSystemSelect').value || null;
    file.bracketSystem = val;
    await savePatientFile(state.currentPatientId, stripHelperFields(file));
    bg.remove();
    toast('اتحدث نوع البراكيت');
    render();
  };
}

function attachPatientHandlers(){
  document.getElementById('crumbClinics2').onclick = () => { state.view = 'clinics'; render(); };
  document.getElementById('crumbPatients').onclick = async () => {
    state.view = 'patients';
    state.clinicSummaryLoading = true;
    render();
    await loadClinicPatientAggregates(state.currentClinicId, state.clinicSummaryMonth || currentMonthStr());
    render();
  };
  document.querySelectorAll('.tab').forEach(el=>{
    el.onclick = () => { state.activeTab = el.dataset.tab; render(); };
  });
  const editBtn = document.getElementById('editPatientBtn');
  if(editBtn) editBtn.onclick = () => openEditPatientModal();
  const newCaseBtn = document.getElementById('markNewCaseBtn');
  if(newCaseBtn) newCaseBtn.onclick = () => markNewCaseManually();
  const debondBtn = document.getElementById('markDebondedBtn');
  if(debondBtn) debondBtn.onclick = () => markCaseDebonded();
  const reactivateBtn = document.getElementById('reactivateCaseBtn');
  if(reactivateBtn) reactivateBtn.onclick = () => reactivateCase();
  const editCaseStartBtn = document.getElementById('editCaseStartBtn');
  if(editCaseStartBtn) editCaseStartBtn.onclick = () => editCaseStartDate();
  const editBracketSystemBtn = document.getElementById('editBracketSystemBtn');
  if(editBracketSystemBtn) editBracketSystemBtn.onclick = () => openEditBracketSystemModal();
  if(state.activeTab === 'diagnosis') attachDiagnosisHandlers();
  if(state.activeTab === 'brackets') attachBracketsHandlers();
  if(state.activeTab === 'monthly') attachMonthlyHandlers();
  if(state.activeTab === 'stages') attachStagesHandlers();
  if(state.activeTab === 'finance') attachFinanceHandlers();
  if(state.activeTab === 'photos') attachPhotosHandlers();
}

