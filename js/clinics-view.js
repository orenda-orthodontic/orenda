// clinics-view.js — شاشة قائمة العيادات
// ============ CLINICS VIEW ============

// clinic owner's picture (uploaded from the clinic edit form) — or the first letter of the clinic
// name when there isn't one, same look as the patient-list avatar
function clinicAvatarHtml(c, size){
  ensureAvatarStyles();
  const url = c && c.doctorPhoto ? resolvePhotoUrl(c.doctorPhoto) : '';
  const letter = Array.from(((c && c.name) || '').trim())[0] || '؟';
  const style = size ? ` style="width:${size}px;height:${size}px;font-size:${Math.round(size*0.4)}px;"` : ' style="width:46px;height:46px;"';
  return url
    ? `<span class="p-avatar"${style}><img src="${escapeHtml(url)}" alt="" loading="lazy" decoding="async"></span>`
    : `<span class="p-avatar"${style}>${escapeHtml(letter)}</span>`;
}

// time-of-day greeting for the Dashboard header (V2.6) — "صباح الخير" / "مساء الخير" / "مساء
// النور" بدل عرض الاسم بس، بنفس روح "GOOD MORNING, MAHMOUD" في المواصفة
function dashboardGreeting(){
  const h = new Date().getHours();
  if(h < 12) return 'صباح الخير';
  if(h < 17) return 'مساء الخير';
  return 'مساء النور';
}

// status badge for a patient row in the finance drill-down (V2.7: "🟢 Paid / 🟠 Partial / 🔴 Overdue")
function financeStatusBadge(status){
  if(status === 'paid') return `<span class="appt-badge" style="background:#e8f5e9;color:#2e7d32;">🟢 مسدد</span>`;
  if(status === 'overdue') return `<span class="appt-badge overdue">🔴 متأخر</span>`;
  return `<span class="appt-badge" style="background:#fff3e0;color:#e65100;">🟠 جزئي</span>`;
}

// Clinic → Patient → Payment-history drill-down (V2.7). Accordion: one clinic expanded at a
// time (state.financeBreakdownExpandedClinicId), same globalFinanceBreakdown scanned at boot.
function renderFinanceBreakdownModalBody(){
  const breakdown = state.globalFinanceBreakdown || {};
  const clinicIds = Object.keys(breakdown).filter(id => breakdown[id].patients.length);
  if(!clinicIds.length) return `<div class="placeholder">مفيش حالات نشطة دلوقتي</div>`;
  return clinicIds.map(id => {
    const cb = breakdown[id];
    const expanded = state.financeBreakdownExpandedClinicId === id;
    return `
      <div class="card" style="margin-bottom:10px;">
        <div class="finance-breakdown-clinic-header" data-clinic-toggle="${id}" style="cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:10px;">
          <b>${escapeHtml(cb.clinicName)}</b>
          <span style="font-size:12px;color:var(--muted);white-space:nowrap;">${formatEgpFromCents(cb.collectedCents)} / ${formatEgpFromCents(cb.caseValueCents)} — متبقي ${formatEgpFromCents(cb.remainingCents)} ${expanded ? '▲' : '▼'}</span>
        </div>
        ${expanded ? `
          <div class="finance-tables" style="margin-top:10px;">
            <table>
              <thead><tr><th>المريض</th><th>الحالة</th><th>المتبقي</th></tr></thead>
              <tbody>
                ${cb.patients.map(p => `
                  <tr class="finance-breakdown-patient-row" data-patient-id="${p.patientId}" data-clinic-id="${id}" style="cursor:pointer;">
                    <td>${escapeHtml(p.name)}</td>
                    <td>${financeStatusBadge(p.status)}</td>
                    <td>${formatEgpFromCents(p.remainingCents)} جنيه</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

function openFinanceBreakdownModal(){
  const old = document.getElementById('financeBreakdownModalBg');
  if(old) old.remove();
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.id = 'financeBreakdownModalBg';
  bg.innerHTML = `
    <div class="modal" style="max-width:640px;width:95%;">
      <h3>تفاصيل الماليات — عيادة ← مريض</h3>
      <div id="financeBreakdownBody" style="max-height:60vh;overflow-y:auto;">${renderFinanceBreakdownModalBody()}</div>
      <div class="modal-actions">
        <button id="closeFinanceBreakdownBtn">تمام</button>
      </div>
    </div>
  `;
  document.body.appendChild(bg);
  bg.onclick = (e) => { if(e.target === bg) bg.remove(); };
  document.getElementById('closeFinanceBreakdownBtn').onclick = () => bg.remove();
  attachFinanceBreakdownHandlers();
}

function attachFinanceBreakdownHandlers(){
  document.querySelectorAll('.finance-breakdown-clinic-header').forEach(el=>{
    el.onclick = () => {
      const id = el.dataset.clinicToggle;
      state.financeBreakdownExpandedClinicId = state.financeBreakdownExpandedClinicId === id ? null : id;
      const body = document.getElementById('financeBreakdownBody');
      if(body) body.innerHTML = renderFinanceBreakdownModalBody();
      attachFinanceBreakdownHandlers();
    };
  });
  document.querySelectorAll('.finance-breakdown-patient-row').forEach(el=>{
    el.onclick = async () => {
      const bg = document.getElementById('financeBreakdownModalBg');
      if(bg) bg.remove();
      state.currentClinicId = el.dataset.clinicId;
      await loadPatients(state.currentClinicId);
      state.currentPatientId = el.dataset.patientId;
      state.activeTab = 'finance';
      state.view = 'patient';
      render();
    };
  });
}

// ---- Dashboard look: greeting card, grouped actions, structured clinic cards (no commission shown).
// Scoped styles are injected from here. All element ids / handler class names used by
// attachClinicsHandlers() are unchanged.
function ensureDashboardStyles(){
  if(document.getElementById('dashProStyles')) return;
  const s = document.createElement('style');
  s.id = 'dashProStyles';
  s.textContent = `
    .dash-hero{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;padding:20px 24px;margin-bottom:22px;background:var(--panel);border:1px solid var(--border);border-radius:16px;}
    .dash-eyebrow{font-size:13px;color:var(--muted);}
    .dash-hero h1{display:flex;align-items:center;gap:6px;margin:2px 0 0;font-size:24px;font-weight:700;}
    .dash-name-edit{background:transparent !important;border:none !important;color:var(--muted) !important;padding:2px 6px !important;font-size:13px;opacity:.6;cursor:pointer;}
    .dash-name-edit:hover{opacity:1;color:var(--accent2) !important;}
    .dash-date{text-align:end;padding-inline-start:20px;border-inline-start:1px solid var(--border);}
    .dash-date-day{font-size:13px;color:var(--muted);}
    .dash-date-num{font-size:20px;font-weight:700;margin-top:2px;}
    .dash-section-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px;flex-wrap:wrap;}
    .dash-section-head .section-title{margin:0;font-size:19px;font-weight:700;}
    .dash-section-actions{display:flex;align-items:center;gap:8px;}
    .dash-menu{position:relative;}
    .dash-menu summary{list-style:none;cursor:pointer;padding:10px 16px;border-radius:10px;font-size:14px;font-weight:600;background:var(--panel);border:1px solid var(--border);color:var(--text);user-select:none;}
    .dash-menu summary::-webkit-details-marker{display:none;}
    .dash-menu summary:hover,.dash-menu[open] summary{background:var(--panel2);}
    .dash-menu-list{position:absolute;inset-inline-end:0;top:calc(100% + 6px);z-index:30;min-width:220px;display:flex;flex-direction:column;gap:4px;padding:6px;background:var(--panel);border:1px solid var(--border);border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.14);}
    .dash-menu-list button{text-align:start;width:100%;}
    .clinic-grid.dash-grid{grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:16px;}
    .clinic-grid .clinic-card{text-align:start;padding:18px;display:flex;flex-direction:column;gap:12px;border-radius:16px;}
    .clinic-grid .clinic-card:hover{border-color:var(--border);box-shadow:0 8px 22px rgba(60,35,25,.10);}
    .cc-head{display:flex;align-items:center;gap:12px;padding-inline-end:30px;}
    .cc-title{min-width:0;flex:1;}
    .cc-name{font-weight:700;font-size:16.5px;line-height:1.3;overflow-wrap:anywhere;}
    .cc-sub{font-size:12.5px;color:#6e5c54;margin-top:3px;}
    .cc-chips{display:flex;flex-wrap:wrap;gap:6px;}
    .cc-chip{font-size:12px;padding:3px 10px;border-radius:20px;font-weight:600;display:inline-block;}
    .cc-chip.warn{background:#fff3cf;color:#6b5200;}
    .cc-chip.bad{background:#fdeee9;color:#9a3a29;}
    .cc-chip.ok{background:#e8f5e9;color:#1b5e20;}
    button.cc-chip{border:0;cursor:pointer;font-family:inherit;}
    .cc-attend{width:100%;background:#e8f5e9 !important;color:#1b5e20 !important;border:1px solid #bfe0c8 !important;border-radius:10px;padding:10px;font-weight:700;font-size:14px;}
    .cc-meta{border-top:1px solid var(--border);padding-top:10px;display:flex;flex-direction:column;gap:5px;margin-top:auto;}
    .cc-meta-row{display:flex;justify-content:space-between;gap:8px;font-size:12.5px;color:#6e5c54;}
    .cc-meta-row b{color:var(--text);font-weight:600;}
    @media (max-width:480px){
      .dash-hero{padding:14px;}
      .dash-hero h1{font-size:19px;}
      .dash-date{display:none;}
      .clinic-grid.dash-grid{grid-template-columns:1fr;}
    }
  `;
  document.head.appendChild(s);
}

function renderClinicsView(){
  ensureDashboardStyles();
  const grid = state.clinics.length ? `
    <div class="clinic-grid dash-grid">
      ${state.clinics.map(c => {
        const dueMonths = monthsSince(c.photoLastMarked);
        const photoDue = c.photoLastMarked ? (dueMonths >= PHOTO_REMINDER_MONTHS)
          : (c.createdAt ? monthsSince(c.createdAt) >= PHOTO_REMINDER_MONTHS : true);
        const upcoming = clinicUpcomingVisits(c);
        const soonVisit = upcoming.find(v => v.daysUntil <= 2);
        const todayAttend = clinicTodayAttendancePending(c);
        const cases = (state.globalClinicCaseCounts && state.globalClinicCaseCounts[c.id] !== undefined) ? state.globalClinicCaseCounts[c.id] : null;
        const hasAlert = !!(soonVisit || photoDue);
        return `
        <div class="clinic-tile clinic-card" data-id="${c.id}" style="position:relative;">
          <button class="secondary small clinic-edit-btn" data-clinic-edit="${c.id}" title="تعديل بيانات العيادة" style="position:absolute;top:10px;inset-inline-end:10px;width:28px;height:28px;padding:0;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;line-height:1;">⚙️</button>
          <div class="cc-head">
            ${clinicAvatarHtml(c, 48)}
            <div class="cc-title">
              <div class="cc-name">${escapeHtml(c.name)}</div>
              ${cases !== null ? `<div class="cc-sub">${cases} حالة</div>` : ''}
            </div>
          </div>
          <div class="cc-chips">
            ${soonVisit ? `<span class="cc-chip warn">ميعاد ${soonVisit.daysUntil<=0 ? 'النهاردة أو فات' : `بعد ${soonVisit.daysUntil} يوم`}</span>` : ''}
            ${photoDue ? `<button type="button" class="cc-chip bad photo-mark-btn" data-clinic-photo="${c.id}" title="اضغط لتسجيل التصوير">تصوير مطلوب — صورت</button>` : ''}
          </div>
          ${todayAttend ? `<button type="button" class="secondary cc-attend clinic-attend-btn" data-clinic-attend="${c.id}" data-attend-date="${todayAttend}">✅ حضرت النهاردة</button>` : ''}
          <div class="cc-meta">
            <div class="cc-meta-row"><span>الميعاد الجاي</span><b>${upcoming.length ? formatDateAr(upcoming[0].date) : 'مفيش ميعاد متسجل'}</b></div>
            <div class="cc-meta-row"><span>آخر تصوير</span><b>${c.photoLastMarked ? formatDateAr(c.photoLastMarked) : '—'}</b></div>
          </div>
        </div>
      `;}).join('')}
    </div>
  ` : `<div class="empty-state">لسه مفيش عيادات مضافة. ابدأ بإضافة أول عيادة.</div>`;

  const now = new Date();

  return `
    <div class="dash-hero">
      <div>
        <div class="dash-eyebrow">${dashboardGreeting()}،</div>
        <h1>
          <span id="doctorNameDisplay">${escapeHtml(state.doctorName || 'MAHMOUD NASSAR')}</span>
          <button class="dash-name-edit" id="editDoctorNameBtn" title="تعديل الاسم">✎</button>
        </h1>
      </div>
      <div class="dash-date">
        <div class="dash-date-day">${escapeHtml(WEEKDAY_LABELS_AR[now.getDay()] || '')}</div>
        <div class="dash-date-num">${escapeHtml(formatDateAr(todayStr()))}</div>
      </div>
    </div>

    <div class="dash-section-head">
      <div class="section-title">عياداتي</div>
      <div class="dash-section-actions">
        <button id="addClinicBtn">+ إضافة عيادة</button>
        <details class="dash-menu" id="dashBackupMenu">
          <summary>النسخ الاحتياطي ▾</summary>
          <div class="dash-menu-list">
            <button class="secondary" id="exportBackupBtn">⬇ تصدير نسخة احتياطية</button>
            <button class="secondary" id="importBackupBtn">⬆ استيراد نسخة احتياطية</button>
            <button class="secondary" id="autoBackupsBtn">🕐 النسخ التلقائية</button>
          </div>
        </details>
      </div>
    </div>
    <input type="file" id="importBackupFile" accept="application/json" style="display:none;">
    ${grid}
  `;
}

function attachClinicsHandlers(){
  document.getElementById('addClinicBtn').onclick = () => openClinicModal();
  document.getElementById('editDoctorNameBtn').onclick = () => openEditDoctorNameModal();
  const openInvFromDashBtn = document.getElementById('openInventoryFromDashBtn');
  if(openInvFromDashBtn) openInvFromDashBtn.onclick = async () => {
    await loadInventory();
    state.view = 'inventory';
    state.inventoryFrom = 'clinics';
    render();
  };
  const financeBreakdownBtn = document.getElementById('openFinanceBreakdownBtn');
  if(financeBreakdownBtn) financeBreakdownBtn.onclick = () => openFinanceBreakdownModal();
  document.querySelectorAll('#dashBackupMenu .dash-menu-list button').forEach(b => b.addEventListener('click', () => { const m = document.getElementById('dashBackupMenu'); if(m) m.open = false; }));
  document.getElementById('exportBackupBtn').onclick = () => exportBackup();
  document.getElementById('autoBackupsBtn').onclick = () => openAutoBackupsModal();
  document.getElementById('importBackupBtn').onclick = () => document.getElementById('importBackupFile').click();
  document.getElementById('importBackupFile').onchange = (e) => {
    const file = e.target.files[0];
    if(file) importBackup(file);
    e.target.value = '';
  };
  document.querySelectorAll('.photo-mark-btn').forEach(el=>{
    el.onclick = (e) => {
      e.stopPropagation();
      openPhotoMarkModal(el.dataset.clinicPhoto);
    };
  });
  document.querySelectorAll('.clinic-attend-btn').forEach(el=>{
    el.onclick = async (e) => {
      e.stopPropagation();
      const ok = await markClinicAttendance(el.dataset.clinicAttend, el.dataset.attendDate, 'attended');
      if(ok) toast('اتسجل حضورك النهاردة');
      render();
    };
  });
  document.querySelectorAll('.clinic-edit-btn').forEach(el=>{
    el.onclick = (e) => {
      e.stopPropagation();
      openClinicFormModal(el.dataset.clinicEdit);
    };
  });
  document.querySelectorAll('.clinic-tile').forEach(el=>{
    el.onclick = async () => {
      state.currentClinicId = el.dataset.id;
      await loadPatients(state.currentClinicId);
      state.view = 'patients';
      state.searchTerm = '';
      state.patientsShowArchived = false;
      state.patientListVisibleCount = PATIENT_LIST_PAGE_SIZE;
      if(!state.clinicSummaryMonth) state.clinicSummaryMonth = currentMonthStr();
      state.clinicSummaryLoading = true;
      render();
      await loadClinicPatientAggregates(state.currentClinicId, state.clinicSummaryMonth);
      render();
      promptPendingAttendance(state.currentClinicId); // لو فيه ميعاد فات ومتسجلش حضورك فيه
    };
  });
  document.querySelectorAll('.dash-attention-row').forEach(el=>{
    el.onclick = async () => {
      state.currentClinicId = el.dataset.clinicId;
      await loadPatients(state.currentClinicId);
      state.currentPatientId = el.dataset.patientId;
      state.activeTab = 'overview';
      state.view = 'patient';
      render();
    };
  });
}

function openEditDoctorNameModal(){
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `
    <div class="modal">
      <h3>تعديل اسم الدكتور</h3>
      <div class="field"><label>الاسم اللي هيظهر أعلى النظام</label><input type="text" id="editDoctorNameInput" value="${escapeHtml(state.doctorName || '')}"></div>
      <div class="modal-actions">
        <button class="secondary" id="cancelDoctorNameBtn">إلغاء</button>
        <button id="saveDoctorNameBtn">حفظ</button>
      </div>
    </div>
  `;
  document.body.appendChild(bg);
  document.getElementById('cancelDoctorNameBtn').onclick = () => bg.remove();
  bg.onclick = (e) => { if(e.target === bg) bg.remove(); };
  document.getElementById('saveDoctorNameBtn').onclick = async () => {
    const name = document.getElementById('editDoctorNameInput').value.trim();
    if(!name){ toast('اكتب اسم'); return; }
    state.doctorName = name;
    await saveDoctorName();
    bg.remove();
    toast('اتحفظ الاسم');
    render();
  };
  setTimeout(()=>document.getElementById('editDoctorNameInput').focus(), 50);
}

// ONE form for both "add clinic" and "edit clinic" (name, doctor's %, visit schedules, and — when
// editing — the last-photo date), instead of those living in separate little modals. Schedules
// are edited on a local copy and only written when the user presses حفظ.
function openClinicModal(){ openClinicFormModal(null); }

function openClinicFormModal(clinicId){
  const existing = clinicId ? state.clinics.find(x => x.id === clinicId) : null;
  if(clinicId && !existing) return;
  const schedules = ((existing && existing.visitSchedules) || []).map(s => ({ ...s }));
  const clinicIdForPhoto = existing ? existing.id : uid(); // a new clinic needs its id up front so its photo can be uploaded on save
  let pendingPhotoBlob = null;   // picked but not uploaded yet (uploads only when حفظ is pressed)
  let pendingPhotoPreview = '';  // object URL of pendingPhotoBlob, for the preview
  let removePhoto = false;
  const weekdayOptionsHtml = WEEKDAY_LABELS_AR.map((lbl,i)=>`<option value="${i}">${lbl}</option>`).join('');
  const ordinalOptionsHtml = [1,2,3,4,-1].map(o=>`<option value="${o}">${ORDINAL_LABELS_AR[String(o)]}</option>`).join('');

  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `
    <div class="modal" style="max-height:90vh;overflow-y:auto;">
      <h3>${existing ? 'تعديل بيانات العيادة' : 'إضافة عيادة جديدة'}</h3>
      <div class="field">
        <label>صورة صاحب العيادة (الدكتور)</label>
        <div class="row" style="gap:12px;align-items:center;">
          <span id="clinicFormAvatar"></span>
          <button type="button" class="secondary small" id="clinicFormPickPhotoBtn">📷 رفع / تغيير الصورة</button>
          <button type="button" class="secondary small" id="clinicFormRemovePhotoBtn">حذف الصورة</button>
          <input type="file" id="clinicFormPhotoInput" accept="image/*" style="display:none;">
        </div>
      </div>
      <div class="field">
        <label>اسم العيادة</label>
        <input type="text" id="clinicFormName" placeholder="مثلاً: عيادة مشالي" value="${escapeHtml(existing ? existing.name : '')}">
      </div>
      <div class="field">
        <label>رقم واتساب العيادة (بيتحط في رسالة تأكيد الميعاد للمرضى)</label>
        <input type="tel" id="clinicFormPhone" placeholder="01xxxxxxxxx" value="${escapeHtml(existing ? (existing.phone || '') : '')}">
      </div>
      <div class="field">
        <label>نسبتك من الحالة (%)</label>
        <input type="number" id="clinicFormCommission" value="${existing ? (existing.commission ?? 70) : 70}" min="0" max="100">
      </div>
      ${existing ? `
        <div class="field">
          <label>تاريخ آخر تصوير</label>
          <input type="date" id="clinicFormPhotoDate" value="${escapeHtml(existing.photoLastMarked || '')}">
        </div>
      ` : ''}
      <div class="section-title" style="font-size:13px;margin-top:14px;">مواعيد العيادة</div>
      <div id="clinicFormScheduleList"></div>
      <div class="row" style="gap:8px;margin-top:6px;">
        <select id="clinicFormOrdinal">${ordinalOptionsHtml}</select>
        <select id="clinicFormWeekday">${weekdayOptionsHtml}</select>
        <button type="button" class="secondary small" id="clinicFormAddScheduleBtn">+ إضافة</button>
      </div>
      <div class="placeholder" style="padding:6px 0;font-size:12px;">مثلاً "أول تلات" أو "تالت سبت" — بيتكرر كل شهر تلقائي</div>
      <div class="modal-actions">
        <button class="secondary" id="clinicFormCancelBtn">إلغاء</button>
        <button id="clinicFormSaveBtn">حفظ</button>
      </div>
    </div>
  `;
  document.body.appendChild(bg);

  function renderScheduleList(){
    const listEl = document.getElementById('clinicFormScheduleList');
    listEl.innerHTML = schedules.length ? schedules.map(sc => `
      <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:6px;">
        <span>${escapeHtml(scheduleLabelAr(sc))} كل شهر</span>
        <button type="button" class="danger small" data-form-del-schedule="${sc.id}">حذف</button>
      </div>
    `).join('') : `<div class="placeholder" style="margin-bottom:6px;">لسه مفيش ميعاد متسجل</div>`;
    listEl.querySelectorAll('[data-form-del-schedule]').forEach(btn => {
      btn.onclick = () => {
        const idx = schedules.findIndex(x => x.id === btn.dataset.formDelSchedule);
        if(idx > -1) schedules.splice(idx, 1);
        renderScheduleList();
      };
    });
  }
  renderScheduleList();

  function renderFormAvatar(){
    const holder = document.getElementById('clinicFormAvatar');
    const typedName = document.getElementById('clinicFormName').value;
    const letter = Array.from(typedName.trim())[0] || '؟';
    const url = pendingPhotoPreview || (!removePhoto && existing && existing.doctorPhoto ? resolvePhotoUrl(existing.doctorPhoto) : '');
    holder.innerHTML = url
      ? `<span class="p-avatar" style="width:56px;height:56px;"><img src="${escapeHtml(url)}" alt=""></span>`
      : `<span class="p-avatar" style="width:56px;height:56px;font-size:22px;">${escapeHtml(letter)}</span>`;
    const hasPhoto = !!(pendingPhotoBlob || (!removePhoto && existing && existing.doctorPhoto));
    document.getElementById('clinicFormRemovePhotoBtn').style.display = hasPhoto ? '' : 'none';
  }
  ensureAvatarStyles();
  renderFormAvatar();
  document.getElementById('clinicFormName').oninput = () => { if(!pendingPhotoPreview) renderFormAvatar(); };
  document.getElementById('clinicFormPickPhotoBtn').onclick = () => document.getElementById('clinicFormPhotoInput').click();
  document.getElementById('clinicFormPhotoInput').onchange = async (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if(!file) return;
    if(!file.type || file.type.indexOf('image/') !== 0){ toast('لازم تختار صورة'); return; }
    // small square-ish avatar — no need for the full 1400px used for clinical photos
    pendingPhotoBlob = await compressImageFile(file, 400, 0.8);
    if(pendingPhotoPreview) URL.revokeObjectURL(pendingPhotoPreview);
    pendingPhotoPreview = URL.createObjectURL(pendingPhotoBlob);
    removePhoto = false;
    renderFormAvatar();
  };
  document.getElementById('clinicFormRemovePhotoBtn').onclick = () => {
    pendingPhotoBlob = null;
    if(pendingPhotoPreview){ URL.revokeObjectURL(pendingPhotoPreview); pendingPhotoPreview = ''; }
    removePhoto = true;
    renderFormAvatar();
  };

  document.getElementById('clinicFormAddScheduleBtn').onclick = () => {
    const weekday = parseInt(document.getElementById('clinicFormWeekday').value, 10);
    const ordinal = parseInt(document.getElementById('clinicFormOrdinal').value, 10);
    if(schedules.some(x => x.weekday === weekday && x.ordinal === ordinal)) return; // already there
    schedules.push({ id: uid(), weekday, ordinal });
    renderScheduleList();
  };
  document.getElementById('clinicFormCancelBtn').onclick = () => bg.remove();
  bg.onclick = (e) => { if(e.target === bg) bg.remove(); };
  document.getElementById('clinicFormSaveBtn').onclick = async () => {
    const name = document.getElementById('clinicFormName').value.trim();
    const commission = parseFloat(document.getElementById('clinicFormCommission').value) || 70;
    const phone = document.getElementById('clinicFormPhone').value.trim();
    if(!name){ toast('اكتب اسم العيادة'); return; }

    // photo first: if the upload fails we stay in the form and nothing else gets saved
    const oldPhoto = existing && existing.doctorPhoto ? existing.doctorPhoto : null;
    let newPhoto = oldPhoto;
    if(pendingPhotoBlob){
      try{
        toast('بيترفع...');
        const path = `clinic-${clinicIdForPhoto}/owner-${uid()}.jpg`;
        const url = await uploadPhotoToStorage(pendingPhotoBlob, path);
        newPhoto = { path, url, uploadedAt: new Date().toISOString() };
      }catch(err){
        console.error(err);
        toast('فشل رفع الصورة — تأكد إن النت شغال');
        return;
      }
    } else if(removePhoto){
      newPhoto = null;
    }

    const clinicBefore = existing ? { name: existing.name, commission: existing.commission ?? 70 } : null;
    if(existing){
      existing.name = name;
      existing.commission = commission;
      existing.phone = phone;
      existing.photoLastMarked = document.getElementById('clinicFormPhotoDate').value || null;
      existing.visitSchedules = schedules;
      existing.doctorPhoto = newPhoto;
    } else {
      state.clinics.push({ id: clinicIdForPhoto, name, phone, commission, createdAt: todayStr(), photoLastMarked: null, visitSchedules: schedules, doctorPhoto: newPhoto });
    }
    const ok = await setData('clinics', state.clinics);
    if(ok){
      if(!existing){
        await logActivity('add_clinic', `أضاف عيادة جديدة: ${name} (نسبتك ${commission}%)`);
      } else if(clinicBefore.commission !== commission || clinicBefore.name !== name){
        const parts = [];
        if(clinicBefore.commission !== commission) parts.push(`النسبة: ${clinicBefore.commission}% ← ${commission}%`);
        if(clinicBefore.name !== name) parts.push(`الاسم: ${clinicBefore.name} ← ${name}`);
        await logActivity('edit_clinic', `عدّل عيادة ${name} — ${parts.join(' | ')}`);
      }
    }
    if(ok && oldPhoto && oldPhoto.path && (!newPhoto || newPhoto.path !== oldPhoto.path)) deletePhotoFromStorage(oldPhoto.path);
    if(newPhoto && newPhoto.path) await refreshPhotoUrlCache([newPhoto.path]);
    if(pendingPhotoPreview) URL.revokeObjectURL(pendingPhotoPreview);
    bg.remove();
    render();
    if(ok) toast(existing ? 'اتحدثت بيانات العيادة' : 'اتضافت العيادة');
  };
  setTimeout(()=>document.getElementById('clinicFormName').focus(), 50);
}

function openPhotoMarkModal(clinicId){
  const c = state.clinics.find(x=>x.id===clinicId);
  if(!c) return;
  const today = todayStr();
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `
    <div class="modal">
      <h3>تصوير — ${escapeHtml(c.name)}</h3>
      <div class="field"><label>تاريخ التصوير</label><input type="date" id="photoMarkDate" value="${c.photoLastMarked || today}"></div>
      <div class="modal-actions">
        <button class="secondary" id="cancelPhotoMarkBtn">إلغاء</button>
        <button id="savePhotoMarkBtn">حفظ</button>
      </div>
    </div>
  `;
  document.body.appendChild(bg);
  document.getElementById('cancelPhotoMarkBtn').onclick = () => bg.remove();
  bg.onclick = (e) => { if(e.target === bg) bg.remove(); };
  document.getElementById('savePhotoMarkBtn').onclick = async () => {
    const date = document.getElementById('photoMarkDate').value || today;
    await markClinicPhotographed(clinicId, date);
    bg.remove();
  };
}

async function markClinicPhotographed(clinicId, date){
  const c = state.clinics.find(x=>x.id===clinicId);
  if(!c) return;
  c.photoLastMarked = date || todayStr();
  const ok = await setData('clinics', state.clinics);
  render();
  if(ok) toast('تمام، هفكرك تاني بعد 3 شهور');
}

function openClinicScheduleModal(clinicId){
  const c = state.clinics.find(x=>x.id===clinicId);
  if(!c) return;
  if(!c.visitSchedules) c.visitSchedules = [];
  const listHtml = c.visitSchedules.length ? c.visitSchedules.map(s=>{
    const next = nextScheduleOccurrence(s);
    return `
      <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:6px;">
        <span>${escapeHtml(scheduleLabelAr(s))} كل شهر — الجاي: ${next ? formatDateAr(next) : '—'}</span>
        <button class="danger small" data-del-schedule="${s.id}">حذف</button>
      </div>
    `;
  }).join('') : `<div class="placeholder" style="margin-bottom:10px;">لسه مفيش ميعاد متسجل للعيادة دي</div>`;

  const weekdayOptionsHtml = WEEKDAY_LABELS_AR.map((lbl,i)=>`<option value="${i}">${lbl}</option>`).join('');
  const ordinalOptionsHtml = [1,2,3,4,-1].map(o=>`<option value="${o}">${ORDINAL_LABELS_AR[String(o)]}</option>`).join('');

  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `
    <div class="modal">
      <h3>مواعيد عيادة ${escapeHtml(c.name)}</h3>
      <div id="scheduleListBody">${listHtml}</div>
      <div class="section-title" style="font-size:13px;margin-top:14px;">إضافة ميعاد جديد</div>
      <div class="row" style="gap:8px;">
        <select id="newScheduleOrdinal">${ordinalOptionsHtml}</select>
        <select id="newScheduleWeekday">${weekdayOptionsHtml}</select>
      </div>
      <div class="placeholder" style="padding:6px 0;font-size:12px;">مثلاً "أول تلات" أو "تالت سبت" — هيتكرر كل شهر تلقائي، ولو غيّرته بعدين هيشتغل بالجديد بس</div>
      <div class="modal-actions">
        <button class="secondary" id="addScheduleBtn">+ إضافة الميعاد ده</button>
        <button id="closeScheduleModalBtn">تمام</button>
      </div>
    </div>
  `;
  document.body.appendChild(bg);
  bg.onclick = (e) => { if(e.target === bg) bg.remove(); };
  document.getElementById('closeScheduleModalBtn').onclick = () => { bg.remove(); render(); };
  document.getElementById('addScheduleBtn').onclick = async () => {
    const weekday = parseInt(document.getElementById('newScheduleWeekday').value, 10);
    const ordinal = parseInt(document.getElementById('newScheduleOrdinal').value, 10);
    c.visitSchedules.push({ id: uid(), weekday, ordinal });
    const ok = await setData('clinics', state.clinics);
    bg.remove();
    if(ok) toast('اتضاف الميعاد');
    openClinicScheduleModal(clinicId);
  };
  bg.querySelectorAll('[data-del-schedule]').forEach(el=>{
    el.onclick = async () => {
      c.visitSchedules = c.visitSchedules.filter(s=>s.id !== el.dataset.delSchedule);
      const ok = await setData('clinics', state.clinics);
      bg.remove();
      if(ok) toast('اتمسح الميعاد');
      openClinicScheduleModal(clinicId);
    };
  });
}

