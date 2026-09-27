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

  // ---- هيدر "٣ ثواني" — القيم دي كلها بتتحسب مرة واحدة هنا وبتتستخدم في الـ return تحت
  const missedMonths = computeMissedMonths(file);
  const unpaidMonths = computeUnpaidMonths(file);
  const caseStartDate = computeCaseStartDate(file);
  const treatmentMonths = caseStartDate ? monthsSince(caseStartDate) : null;
  const longDuration = treatmentMonths !== null && treatmentMonths >= CASE_LONG_DURATION_MONTHS;
  const expectedMonths = parseInt(file.expectedDurationMonths, 10) || null;
  const durationLabel = treatmentMonths === null ? null
    : (expectedMonths ? `${treatmentMonths} / ${expectedMonths} شهر` : `${treatmentMonths} شهر`);
  const lastVisitDate = patientLastVisitDate(file);
  const nextClinicVisitDate = patientNextClinicVisit(clinic);
  const paymentStatus = patientPaymentStatus(file);
  const headerTags = patientHeaderTags(file);
  const isDebonded = (file.caseStatus || 'active') === 'debonded';

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
        <div style="flex:1;min-width:0;">
          <div class="pbig" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <span>${escapeHtml(patient.name)}</span>
            <span class="appt-badge" style="background:${isDebonded ? 'var(--panel2)' : 'rgba(46,157,111,.15)'};color:${isDebonded ? 'var(--muted)' : 'var(--green)'};border:1px solid ${isDebonded ? 'var(--border)' : 'var(--green)'};">
              ${isDebonded ? '🔓 فكت' : '🟢 شغالة'}
            </span>
          </div>
          <div class="psub">حالة رقم ${escapeHtml(patient.number || '-')} — براكيت ${bracketSystemLabel(file.bracketSystem)}</div>

          ${headerTags.length ? `
            <div class="stage-tags" style="margin-top:6px;">
              ${headerTags.map(t=>`<span class="stage-tag checked" style="cursor:default;">${escapeHtml(t)}</span>`).join('')}
            </div>
          ` : ''}

          ${durationLabel ? `<div class="psub${longDuration?' stock-alert-blink':''}" style="margin-top:8px;${longDuration?'color:var(--red);':''}">⏱ مدة العلاج: ${escapeHtml(durationLabel)}${longDuration ? ' ⚠ أكتر من سنة ونص' : ''}</div>` : ''}
          ${isDebonded && file.debondDate ? `<div class="psub" style="margin-top:4px;">تاريخ الفك: ${formatDateAr(file.debondDate)}</div>` : ''}

          <div class="psub" style="margin-top:4px;">
            ${lastVisitDate ? `آخر زيارة: ${formatDateAr(lastVisitDate)}` : 'لسه مفيش زيارة مسجلة'}${nextClinicVisitDate ? ` &nbsp;|&nbsp; ميعاد العيادة الجاي: ${formatDateAr(nextClinicVisitDate)}` : ''}
          </div>
          <div class="psub" style="margin-top:4px;color:${paymentStatus.color};">${paymentStatus.label}</div>

          ${missedMonths >= MISSED_MONTHS_ALERT_THRESHOLD ? `<div class="psub" style="margin-top:6px;"><span class="appt-badge overdue stock-alert-blink">⚠ مجاش من ${missedMonths} شهر</span></div>` : ''}
          ${unpaidMonths >= UNPAID_MONTHS_ALERT_THRESHOLD ? `<div class="psub" style="margin-top:4px;"><span class="appt-badge overdue stock-alert-blink">💰 مدفعش من ${unpaidMonths} شهر</span></div>` : ''}
          ${(file.newCaseEvents||[]).length ? `<div class="psub" style="margin-top:4px;">🆕 حالات جديدة مسجلة: ${file.newCaseEvents.length} (آخرها ${formatDateAr([...file.newCaseEvents].sort((a,b)=>(b.date||'').localeCompare(a.date||''))[0].date)})</div>` : ''}
          <div class="psub" style="margin-top:4px;">${patient.phone ? `<a class="wa-btn small" data-wa-link href="${buildWhatsappLinkWithText(patient.phone, buildPatientGreetingMessage(patient))}" target="_blank" rel="noopener">💬 ${escapeHtml(patient.phone)}</a>` : 'مفيش رقم موبايل'}</div>
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap;">
          <button class="secondary small" id="markNewCaseBtn">🆕 حالة جديدة</button>
          ${isDebonded
            ? `<button class="secondary small" id="reactivateCaseBtn">↩️ رجّع الحالة نشطة</button>`
            : `<button class="secondary small" id="markDebondedBtn">🔓 الحالة فكت</button>`}
          <button class="secondary small" id="editPatientBtn">✏️ تعديل بيانات المريض</button>
        </div>
      </div>
    </div>
    <div class="tabs">${tabsHtml}</div>
    <div class="card">${bodyHtml}</div>
  `;
}

// ---- Patient header "٣ ثواني" helpers ----

// آخر زيارة حقيقية (مش يوم "مجاش") من المتابعة الشهرية
function patientLastVisitDate(file){
  const real = (file.monthlyLog||[]).filter(e => e.date && !e.missed);
  if(!real.length) return null;
  return [...real].sort((a,b)=>(b.date||'').localeCompare(a.date||''))[0].date;
}

// مفيش تاريخ ميعاد مسجل لكل مريض لوحده في النظام حاليًا — فبنستخدم أقرب يوم شغل للعيادة نفسها
// (نفس المصدر المستخدم في كارت العيادة بشاشة العيادات)، وده تقريبي مش ميعاد شخصي للمريض ده تحديدًا
function patientNextClinicVisit(clinic){
  if(!clinic) return null;
  const upcoming = clinicUpcomingVisits(clinic);
  return upcoming.length ? upcoming[0].date : null;
}

// حالة الدفع من نفس منطق تبويب الحسابات (money-utils.js + finance-tab.js) — من غير ما نعيد
// الحساب من الصفر هنا
function patientPaymentStatus(file){
  const totalCents = readFinanceTotalCents(file);
  const extrasSumCents = (file.financeExtras||[]).reduce((s,e)=> s + readAmountCents(e), 0);
  const paidSumCents = (file.payments||[]).reduce((s,p)=> s + readAmountCents(p), 0);
  const caseValueCents = totalCents + extrasSumCents;
  const manualRemainingCents = readFinanceRemainingCents(file);
  const remainingCents = manualRemainingCents !== null ? manualRemainingCents : (caseValueCents - paidSumCents);
  if(file.accountSettled) return { label: '✅ الحساب خلص', color: 'var(--green)' };
  if(remainingCents <= 0) return { label: '✅ متسدد بالكامل', color: 'var(--green)' };
  return { label: `⏳ متبقي ${formatEgpFromCents(remainingCents)} جنيه`, color: 'var(--red)' };
}

// تاجات سريعة تلخّص الحالة، مبنية على بيانات حقيقية موجودة فعلاً بدل تصنيف مخترع: حقل الخلع/بدون
// خلع من خطة العلاج + أول كام بند في Problem List and Mechanics (نفس القسم المستخدم في 🚩).
// لو عايز تصنيف منظم زي "Class II" لازم يتضاف كحقل ثابت في شيت التشخيص الأول — دلوقتي الشيت نص
// حر بالكامل فمفيش مكان موثوق نجيب منه "Class II" أو "Crowding" تحديدًا.
function patientHeaderTags(file){
  const tags = [];
  const txPlan = findDiagSection(file, 'Treatment Plan');
  const extraction = findDiagField(txPlan, 'Extraction / Non-extraction');
  if(extraction) tags.push(extraction);
  const problemSection = (file.diagnosisSections||[]).find(s => s.title.trim().toLowerCase() === 'problem list and mechanics');
  (problemSection ? problemSection.fields||[] : []).forEach(f=>{
    if(f.label && tags.length < 4) tags.push(f.label.split(':')[0].trim());
  });
  return tags.slice(0, 4);
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

  const chiefText = file.chiefComplaint || '';

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
  // "اللي اتعمل" بيتاخد من آخر شهر اتسجل فعليًا، و"الشهر الجاي" هو الشهر اللي بعده مباشرة —
  // بيتحدث لوحده تلقائي كل ما يتسجل شهر جديد، من غير ما حد يلمس التاريخ يدوي
  const doneMonthLabel = lastEntry ? monthLabelAr((lastEntry.date||'').slice(0,7)) : '';
  const nextMonthLabel = lastEntry ? monthLabelAr(addMonthToYm((lastEntry.date||'').slice(0,7), 1)) : '';

  const bm = ensureBracketMap(file);
  const allNums = [...FDI_TEETH_ROWS.upper, ...FDI_TEETH_ROWS.lower];
  const brokenNow = allNums.filter(n=>bm.teeth[n].status==='broken').length;

  // P0-5: بالقروش (integer) — نفس مصدر finance-tab.js
  const caseValueCents = readFinanceTotalCents(file) + (file.financeExtras||[]).reduce((s,e)=>s+readAmountCents(e),0);
  const paidSumCents = (file.payments||[]).reduce((s,p)=>s+readAmountCents(p),0);
  const remainingCents = caseValueCents - paidSumCents;

  const stageCounts = computeStageCounts(file);
  let lastStageLabel = '', lastStageDate = '';
  allTreatmentStages().forEach(st=>{
    (stageCounts[st.id]||[]).forEach(e=>{
      if(!lastStageDate || (e.date||'') > lastStageDate){ lastStageDate = e.date||''; lastStageLabel = st.label; }
    });
  });

  // سجل الحضور — تواريخ بس: جه (من غير تفاصيل اللي اتعمل)، أو مجاش + السبب. القايمة نفسها مقفولة
  // ورا زرار عشان الصفحة متطولش، والعدادين (جه / مجاش) فوقها ظاهرين طول الوقت.
  const dateLoggedEntries = (file.monthlyLog||[]).filter(e=>e.date).sort((a,b)=>a.date.localeCompare(b.date));
  const attendanceRows = dateLoggedEntries.map(e => ({ date: e.date, missed: !!e.missed, reason: e.missedReason })).reverse(); // أحدث حاجة فوق
  const cameCount = dateLoggedEntries.filter(e=>!e.missed).length;
  const missedCount = dateLoggedEntries.filter(e=>e.missed).length;
  const attendanceOpen = !!state.attendanceLogOpen;

  return `
    <div class="patient-notes-banner">
      <div class="patient-notes-header">📌 ملاحظات</div>
      <div class="patient-notes-list">
        ${(file.notes||[]).length ? [...file.notes].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(n=>`
          <div class="patient-note-item">
            <div class="patient-note-text">${escapeHtml(n.text)}</div>
            <div class="patient-note-meta">
              <span>${formatDateAr(n.date)}</span>
              <button type="button" class="patient-note-remove" data-note-id="${n.id}" title="حذف الملاحظة">×</button>
            </div>
          </div>
        `).join('') : `<div class="placeholder" style="padding:4px 0;">لسه مفيش ملاحظات</div>`}
      </div>
      <div class="row" style="gap:8px;margin-top:8px;">
        <input type="text" id="newPatientNoteInput" placeholder="اكتب ملاحظة جديدة...">
        <button type="button" id="addPatientNoteBtn" class="secondary small">+ إضافة</button>
      </div>
    </div>
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
        <div class="overview-card-title">اللي اتعمل${doneMonthLabel ? ' — ' + escapeHtml(doneMonthLabel) : ''}</div>
        ${lastEntry ? `
          <div class="overview-row"><span class="ov-lbl">التاريخ</span><span class="ov-val">${escapeHtml(lastEntry.date||'')}</span></div>
          ${lastEntry.missed
            ? `<div class="overview-row"><span class="ov-lbl">اللي اتعمل</span><span class="ov-val" style="color:var(--red);">❌ مجاش${lastEntry.missedReason ? ' (' + escapeHtml(lastEntry.missedReason) + ')' : ''}</span></div>`
            : `<div class="overview-row"><span class="ov-lbl">اللي اتعمل</span><span class="ov-val">${escapeHtml(lastDoneText || '—')}</span></div>`}
        ` : `<div class="placeholder">لسه مفيش متابعة مسجلة</div>`}
        ${lastHygieneEntry ? `<div class="overview-row"><span class="ov-lbl">آخر تقييم نظافة</span><span class="ov-val"><span class="hygiene-chip ${HYGIENE_CLASS[lastHygieneEntry.hygieneRating]}">${HYGIENE_LABELS[lastHygieneEntry.hygieneRating]}</span></span></div>` : ''}
      </div>

      <div class="overview-card">
        <div class="overview-card-title">الشهر الجاي${nextMonthLabel ? ' — ' + escapeHtml(nextMonthLabel) : ''}</div>
        ${lastPlanText ? `
          <div class="overview-row"><span class="ov-lbl">الخطة</span><span class="ov-val">${escapeHtml(lastPlanText)}</span></div>
        ` : `<div class="placeholder">لسه مفيش خطة مسجلة</div>`}
      </div>

      <div class="overview-card">
        <div class="overview-card-title">خريطة الفصوص</div>
        <div class="overview-row"><span class="ov-lbl">مكسور حاليًا</span><span class="ov-val ${brokenNow>0?'ov-alert':''}">${brokenNow}</span></div>
      </div>

      <div class="overview-card">
        <div class="overview-card-title">الحسابات</div>
        <div class="overview-row"><span class="ov-lbl">الإجمالي</span><span class="ov-val">${formatEgpFromCents(caseValueCents)} جنيه</span></div>
        <div class="overview-row"><span class="ov-lbl">المحصّل</span><span class="ov-val">${formatEgpFromCents(paidSumCents)} جنيه</span></div>
        <div class="overview-row"><span class="ov-lbl">الباقي</span><span class="ov-val ${remainingCents>0?'ov-alert':''}">${formatEgpFromCents(remainingCents)} جنيه</span></div>
        ${file.accountSettled ? `<div class="overview-row"><span class="ov-lbl">حالة الحساب</span><span class="ov-val" style="color:var(--green);">✅ خلص</span></div>` : ''}
      </div>

      <div class="overview-card">
        <div class="overview-card-title">مراحل العلاج</div>
        ${lastStageLabel ? `<div class="overview-row"><span class="ov-lbl">آخر مرحلة</span><span class="ov-val">${escapeHtml(lastStageLabel)} (${escapeHtml(lastStageDate)})</span></div>` : `<div class="placeholder">لسه مفيش مرحلة متسجلة</div>`}
      </div>

      <div class="overview-card">
        <div class="overview-card-title">سجل الحضور</div>
        <div class="overview-row"><span class="ov-lbl">جه</span><span class="ov-val">${cameCount} مرة</span></div>
        <div class="overview-row"><span class="ov-lbl">مجاش</span><span class="ov-val ${missedCount?'ov-alert':''}">${missedCount} مرة</span></div>
        ${attendanceRows.length ? `
          <button type="button" class="secondary small" id="toggleAttendanceLogBtn" style="margin-top:8px;">${attendanceOpen ? '▾ إخفاء' : '▸ عرض'} سجل الحضور (${attendanceRows.length})</button>
          ${attendanceOpen ? `
            <div style="margin-top:8px;max-height:220px;overflow-y:auto;">
              ${attendanceRows.map(r => `
                <div style="font-size:12px;line-height:1.7;padding:4px 0;border-bottom:1px solid var(--border);">
                  ${r.missed
                    ? `<b>${escapeHtml(formatDateAr(r.date))}</b> — <span style="color:var(--red);">❌ مجاش${r.reason ? ' (' + escapeHtml(r.reason) + ')' : ''}</span>`
                    : `<b>${escapeHtml(formatDateAr(r.date))}</b> — جه`}
                </div>
              `).join('')}
            </div>
          ` : ''}
        ` : `<div class="placeholder">لسه مفيش متابعة مسجلة</div>`}
      </div>
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
  if(state.activeTab === 'diagnosis') attachDiagnosisHandlers();
  if(state.activeTab === 'monthly') attachMonthlyHandlers();
  if(state.activeTab === 'stages') attachStagesHandlers();
  if(state.activeTab === 'finance') attachFinanceHandlers();
  if(state.activeTab === 'photos') attachPhotosHandlers();
}

