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

  // خريطة الفصوص بقت جوه شاشة المتابعة الشهرية — لو المستخدم كان واقف على التبويب القديم
  // قبل التحديث (محفوظ في آخر مكان في localStorage) نوديه على المدموج بدل شاشة فاضية
  if(state.activeTab === 'brackets') state.activeTab = 'monthly';

  const tabs = [
    {id:'overview', label:'نظرة عامة'},
    {id:'diagnosis', label:'التشخيص والخطة'},
    {id:'monthly', label:'المتابعة الشهرية والفصوص'},
    {id:'photos', label:'الصور'},
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
  } else if(state.activeTab === 'stages'){
    bodyHtml = renderStagesTab();
  } else if(state.activeTab === 'hygiene'){
    bodyHtml = renderHygieneTab();
  } else if(state.activeTab === 'finance'){
    bodyHtml = renderFinanceTab();
  }

  const missedMonths = computeMissedMonths(file);
  const unpaidMonths = computeUnpaidMonths(file);
  const isDebonded = (file.caseStatus||'active') === 'debonded';
  const startDate = computeCaseStartDate(file);
  const treatmentMonths = startDate ? monthsSince(startDate) : 0;
  const stageSummary = lastStageLabel ? `${escapeHtml(lastStageLabel)}${lastStageDate ? ' · ' + escapeHtml(lastStageDate) : ''}` : 'لسه مفيش مرحلة';

  return `
    <div class="patient-backbar">
      <div class="breadcrumb">
        <span class="crumb" id="crumbClinics2">العيادات</span>
        <span class="sep">/</span>
        <span class="crumb" id="crumbPatients">${escapeHtml(clinic ? clinic.name : '')}</span>
        <span class="sep">/</span>
        <span>${escapeHtml(patient.name)}</span>
      </div>
    </div>

    <section class="patient-hero">
      <div class="patient-hero-main">
        <div class="patient-identity">
          <div class="patient-avatar">${escapeHtml((patient.name||'?').trim().charAt(0) || '?')}</div>
          <div class="patient-title-wrap">
            <div class="patient-title-line">
              <h1>${escapeHtml(patient.name)}</h1>
              <span class="case-status ${isDebonded ? 'closed' : 'active'}">${isDebonded ? '● خلصت' : '● نشطة'}</span>
            </div>
            <div class="patient-meta">#${escapeHtml(patient.number || '-')} · ${escapeHtml(bracketSystemLabel(file.bracketSystem))}</div>
            ${patient.phone ? `<a class="patient-phone" data-wa-link href="${buildWhatsappLinkWithText(patient.phone, buildPatientGreetingMessage(patient))}" target="_blank" rel="noopener">💬 ${escapeHtml(patient.phone)}</a>` : `<span class="patient-meta">مفيش رقم موبايل</span>`}
          </div>
        </div>

        <div class="patient-hero-actions">
          <button class="secondary small" id="editPatientBtn">✏️ تعديل</button>
          ${isDebonded ? `<button class="secondary small" id="reactivateCaseBtn">↩️ رجّع نشطة</button>` : `<button class="secondary small" id="markDebondedBtn">🔓 فك الحالة</button>`}
          <button class="secondary small" id="markNewCaseBtn">🆕 حالة جديدة</button>
        </div>
      </div>

      <div class="patient-alerts">
        ${missedMonths >= MISSED_MONTHS_ALERT_THRESHOLD ? `<span class="case-alert warning">⚠ مجاش من ${missedMonths} شهر</span>` : ''}
        ${unpaidMonths >= UNPAID_MONTHS_ALERT_THRESHOLD ? `<span class="case-alert danger">💰 مدفعش من ${unpaidMonths} شهر</span>` : ''}
        ${treatmentMonths >= CASE_LONG_DURATION_MONTHS ? `<span class="case-alert warning">⏱ ${treatmentMonths} شهر في العلاج</span>` : ''}
      </div>

      <div class="patient-metrics">
        <div class="patient-metric"><span>بداية العلاج</span><b>${startDate ? escapeHtml(formatDateAr(startDate)) : '—'}</b></div>
        <div class="patient-metric"><span>مدة العلاج</span><b>${startDate ? `${treatmentMonths} شهر` : '—'}</b></div>
        <div class="patient-metric"><span>آخر مرحلة</span><b>${stageSummary}</b></div>
        <div class="patient-metric"><span>الباقي</span><b class="${remaining > 0 ? 'metric-alert' : 'metric-good'}">${remaining.toLocaleString()} ج</b></div>
      </div>

      <div class="patient-quick-actions">
        <button type="button" class="quick-action primary" data-patient-quick="monthly"><span>＋</span><div><b>زيارة</b><small>تسجيل متابعة</small></div></button>
        <button type="button" class="quick-action" data-patient-quick="photos"><span>＋</span><div><b>صورة</b><small>إضافة صور</small></div></button>
        <button type="button" class="quick-action" data-patient-quick="note"><span>＋</span><div><b>ملاحظة</b><small>تسجيل ملاحظة</small></div></button>
        <button type="button" class="quick-action" data-patient-quick="finance"><span>＋</span><div><b>دفعة</b><small>الحسابات</small></div></button>
      </div>
    </section>

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
  const log = file.monthlyLog || [];
  const sortedLog = [...log].filter(e=>e.date).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const lastEntry = sortedLog[0] || null;
  const nextEntry = sortedLog.find(e=>!e.missed && (e.planUpper || e.planLower || e.planBoth !== undefined || e.plan));

  const chiefText = file.chiefComplaint || '';
  const txPlan = findDiagSection(file, 'Treatment Plan');
  const extraction = findDiagField(txPlan, 'Extraction / Non-extraction');
  const upperPlan = findDiagField(txPlan, 'Upper plan');
  const lowerPlan = findDiagField(txPlan, 'Lower plan');
  const spaceAnchor = findDiagSection(file, 'Space Management / Anchorage');
  const anchorage = findDiagField(spaceAnchor, 'Anchorage');

  const lastDoneText = lastEntry
    ? [lastEntry.doneUpper, lastEntry.doneLower, lastEntry.doneBoth !== undefined ? lastEntry.doneBoth : lastEntry.done].filter(Boolean).join(' | ')
    : '';
  const lastPlanText = lastEntry
    ? [lastEntry.planUpper, lastEntry.planLower, lastEntry.planBoth !== undefined ? lastEntry.planBoth : lastEntry.plan].filter(Boolean).join(' | ')
    : '';
  const doneMonthLabel = lastEntry ? monthLabelAr((lastEntry.date||'').slice(0,7)) : '';
  const nextMonthLabel = lastEntry ? monthLabelAr(addMonthToYm((lastEntry.date||'').slice(0,7), 1)) : '';

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
  allTreatmentStages().forEach(st=>{
    (stageCounts[st.id]||[]).forEach(e=>{
      if(!lastStageDate || (e.date||'') > lastStageDate){ lastStageDate = e.date||''; lastStageLabel = st.label; }
    });
  });

  const missedCount = sortedLog.filter(e=>e.missed).length;
  const cameCount = sortedLog.filter(e=>!e.missed).length;
  const missedMonths = computeMissedMonths(file);
  const accountState = remaining > 0 ? 'مفتوح' : 'مسدد';
  const accountClass = remaining > 0 ? 'ov-alert' : 'ov-good';
  const currentStage = lastStageLabel || 'لسه مفيش مرحلة';
  const clinicalNext = lastPlanText || 'حدد الهدف القادم في آخر متابعة';

  return `
    <div class="clinical-overview">
      <div class="clinical-overview-grid">
        <section class="command-card command-card-main">
          <div class="command-card-head">
            <div>
              <div class="eyebrow">الحالة الآن</div>
              <h2>ملخص سريري سريع</h2>
            </div>
            <span class="command-status ${remaining>0 || missedMonths>=MISSED_MONTHS_ALERT_THRESHOLD ? 'attention' : 'ok'}">
              ${missedMonths>=MISSED_MONTHS_ALERT_THRESHOLD ? 'يحتاج متابعة' : 'على المسار'}
            </span>
          </div>
          <div class="clinical-focus-grid">
            <div class="focus-item">
              <span>المشكلة الأساسية</span>
              <strong>${chiefText ? escapeHtml(chiefText) : 'مش متسجلة'}</strong>
            </div>
            <div class="focus-item">
              <span>المرحلة الحالية</span>
              <strong>${escapeHtml(currentStage)}</strong>
            </div>
            <div class="focus-item wide">
              <span>الهدف / الخطوة القادمة</span>
              <strong>${escapeHtml(clinicalNext)}</strong>
            </div>
          </div>
        </section>

        <section class="command-card attention-card">
          <div class="command-card-head">
            <div><div class="eyebrow">Attention</div><h2>محتاج تبص على إيه؟</h2></div>
          </div>
          <div class="attention-list">
            ${missedMonths>=MISSED_MONTHS_ALERT_THRESHOLD ? `<div class="attention-row danger"><span>⚠</span><div><b>متابعة متأخرة</b><small>المريض مجاش من ${missedMonths} شهر</small></div></div>` : ''}
            ${remaining>0 ? `<div class="attention-row warning"><span>💰</span><div><b>حساب مفتوح</b><small>متبقي ${remaining.toLocaleString()} جنيه</small></div></div>` : `<div class="attention-row success"><span>✓</span><div><b>الحساب مسدد</b><small>مفيش مبلغ متبقي</small></div></div>`}
            ${brokenNow>0 ? `<div class="attention-row warning"><span>🦷</span><div><b>${brokenNow} فص مكسور</b><small>راجع خريطة الفصوص في المتابعة</small></div></div>` : `<div class="attention-row success"><span>✓</span><div><b>الفصوص</b><small>مفيش فصوص مكسورة حاليًا</small></div></div>`}
            ${missedMonths<MISSED_MONTHS_ALERT_THRESHOLD && remaining<=0 && brokenNow===0 ? `<div class="attention-empty">الحالة مفيهاش تنبيهات حرجة حاليًا.</div>` : ''}
          </div>
        </section>
      </div>

      <section class="command-card visit-command">
        <div class="command-card-head">
          <div><div class="eyebrow">Clinical timeline</div><h2>آخر زيارة → القرار القادم</h2></div>
          ${lastEntry ? `<span class="date-chip">${escapeHtml(formatDateAr(lastEntry.date))}</span>` : ''}
        </div>
        <div class="decision-flow">
          <div class="decision-block">
            <span class="decision-label">اللي حصل</span>
            ${lastEntry ? (lastEntry.missed
              ? `<strong class="danger-text">❌ مجاش${lastEntry.missedReason ? ` — ${escapeHtml(lastEntry.missedReason)}` : ''}</strong>`
              : `<strong>${escapeHtml(lastDoneText || 'مفيش تفاصيل مسجلة')}</strong>`) : `<div class="empty-inline">لسه مفيش زيارة مسجلة</div>`}
          </div>
          <div class="decision-arrow">←</div>
          <div class="decision-block next">
            <span class="decision-label">الخطة القادمة</span>
            ${lastPlanText ? `<strong>${escapeHtml(lastPlanText)}</strong><small>${escapeHtml(nextMonthLabel)}</small>` : `<div class="empty-inline">سجل الخطة القادمة في المتابعة</div>`}
          </div>
        </div>
      </section>

      <div class="overview-section-label">معلومات الحالة</div>
      <div class="overview-grid refined-overview-grid">
        <div class="overview-card">
          <div class="overview-card-title">خطة العلاج</div>
          ${chiefText ? `<div class="overview-row"><span class="ov-lbl">Chief Complaint</span><span class="ov-val">${escapeHtml(chiefText)}</span></div>` : ''}
          <div class="overview-row"><span class="ov-lbl">خلع / بدون خلع</span><span class="ov-val">${extraction ? escapeHtml(extraction) : '—'}</span></div>
          <div class="overview-row"><span class="ov-lbl">Upper plan</span><span class="ov-val">${upperPlan ? escapeHtml(upperPlan) : '—'}</span></div>
          <div class="overview-row"><span class="ov-lbl">Lower plan</span><span class="ov-val">${lowerPlan ? escapeHtml(lowerPlan) : '—'}</span></div>
          <div class="overview-row"><span class="ov-lbl">Anchorage</span><span class="ov-val">${anchorage ? escapeHtml(anchorage) : '—'}</span></div>
        </div>

        <div class="overview-card">
          <div class="overview-card-title">الحسابات</div>
          <div class="overview-row"><span class="ov-lbl">الإجمالي</span><span class="ov-val">${caseValue.toLocaleString()} جنيه</span></div>
          <div class="overview-row"><span class="ov-lbl">المحصّل</span><span class="ov-val">${paidSum.toLocaleString()} جنيه</span></div>
          <div class="overview-row"><span class="ov-lbl">الباقي</span><span class="ov-val ${accountClass}">${remaining.toLocaleString()} جنيه</span></div>
          <div class="overview-row"><span class="ov-lbl">الحالة</span><span class="ov-val ${accountClass}">${accountState}</span></div>
        </div>

        <div class="overview-card">
          <div class="overview-card-title">مراحل العلاج</div>
          ${lastStageLabel ? `<div class="overview-row"><span class="ov-lbl">آخر مرحلة</span><span class="ov-val">${escapeHtml(lastStageLabel)}</span></div><div class="overview-row"><span class="ov-lbl">التاريخ</span><span class="ov-val">${escapeHtml(formatDateAr(lastStageDate))}</span></div>` : `<div class="placeholder">لسه مفيش مرحلة متسجلة</div>`}
        </div>

        <div class="overview-card">
          <div class="overview-card-title">الحضور</div>
          <div class="attendance-mini-stats"><div><b>${cameCount}</b><span>جه</span></div><div class="missed"><b>${missedCount}</b><span>مجاش</span></div></div>
          ${sortedLog.length ? `<button type="button" class="secondary small" id="toggleAttendanceLogBtn" style="margin-top:10px;">${state.attendanceLogOpen ? '▾ إخفاء السجل' : '▸ عرض السجل'} (${sortedLog.length})</button>` : `<div class="placeholder">لسه مفيش متابعة مسجلة</div>`}
          ${state.attendanceLogOpen && sortedLog.length ? `<div class="attendance-log">${sortedLog.map(r=>`<div><b>${escapeHtml(formatDateAr(r.date))}</b><span class="${r.missed?'danger-text':''}">${r.missed ? `❌ مجاش${r.missedReason ? ` (${escapeHtml(r.missedReason)})` : ''}` : '✓ جه'}</span></div>`).join('')}</div>` : ''}
        </div>
      </div>

      <section class="patient-notes-banner refined-notes">
        <div class="patient-notes-header">📌 ملاحظات الحالة</div>
        <div class="patient-notes-list">
          ${(file.notes||[]).length ? [...file.notes].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(n=>`
            <div class="patient-note-item"><div class="patient-note-text">${escapeHtml(n.text)}</div><div class="patient-note-meta"><span>${formatDateAr(n.date)}</span><button type="button" class="patient-note-remove" data-note-id="${n.id}" title="حذف الملاحظة">×</button></div></div>
          `).join('') : `<div class="placeholder" style="padding:4px 0;background:transparent;border:none;">لسه مفيش ملاحظات</div>`}
        </div>
        <div class="row" style="gap:8px;margin-top:8px;"><input type="text" id="newPatientNoteInput" placeholder="اكتب ملاحظة جديدة..."><button type="button" id="addPatientNoteBtn" class="secondary small">+ إضافة</button></div>
      </section>
    </div>
  `;
}
async function addPatientNote(){
  const input = document.getElementById('newPatientNoteInput');
  if(!input) return;
  const text = input.value.trim();
  if(!text) return;
  const file = state.currentPatientFile;
  if(!file.notes) file.notes = [];
  file.notes.push({ id: uid(), text, date: todayStr() });
  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  render();
}

async function removePatientNote(noteId){
  if(!(await confirmModal('حذف الملاحظة دي؟'))) return;
  const file = state.currentPatientFile;
  file.notes = (file.notes||[]).filter(n=>n.id!==noteId);
  await savePatientFile(state.currentPatientId, stripHelperFields(file));
  render();
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
  const attendanceBtn = document.getElementById('toggleAttendanceLogBtn');
  if(attendanceBtn) attendanceBtn.onclick = () => { state.attendanceLogOpen = !state.attendanceLogOpen; render(); };
  const addNoteBtn = document.getElementById('addPatientNoteBtn');
  if(addNoteBtn) addNoteBtn.onclick = () => addPatientNote();
  const noteInput = document.getElementById('newPatientNoteInput');
  if(noteInput) noteInput.onkeydown = (e) => { if(e.key === 'Enter'){ e.preventDefault(); addPatientNote(); } };
  document.querySelectorAll('.patient-note-remove').forEach(el=>{
    el.onclick = () => removePatientNote(el.dataset.noteId);
  });
  document.querySelectorAll('[data-patient-quick]').forEach(el=>{
    el.onclick = () => {
      const target = el.dataset.patientQuick;
      if(target === 'note'){
        state.activeTab = 'overview';
        render();
        setTimeout(() => {
          const input = document.getElementById('newPatientNoteInput');
          if(input){ input.focus(); input.scrollIntoView({behavior:'smooth', block:'center'}); }
        }, 50);
        return;
      }
      state.activeTab = target;
      render();
    };
  });
  if(state.activeTab === 'diagnosis') attachDiagnosisHandlers();
  if(state.activeTab === 'monthly') attachMonthlyHandlers();
  if(state.activeTab === 'stages') attachStagesHandlers();
  if(state.activeTab === 'finance') attachFinanceHandlers();
  if(state.activeTab === 'photos') attachPhotosHandlers();
}

