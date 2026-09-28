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

function renderClinicsView(){
  const grid = state.clinics.length ? `
    <div class="clinic-grid">
      ${state.clinics.map(c => {
        const dueMonths = monthsSince(c.photoLastMarked);
        const photoDue = c.photoLastMarked ? (dueMonths >= PHOTO_REMINDER_MONTHS)
          : (c.createdAt ? monthsSince(c.createdAt) >= PHOTO_REMINDER_MONTHS : true);
        const upcoming = clinicUpcomingVisits(c);
        const soonVisit = upcoming.find(v => v.daysUntil <= 2);
        return `
        <div class="clinic-tile" data-id="${c.id}" style="position:relative;">
          <button class="secondary small clinic-edit-btn" data-clinic-edit="${c.id}" title="تعديل بيانات العيادة" style="position:absolute;top:8px;left:8px;width:28px;height:28px;padding:0;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;line-height:1;">⚙️</button>
          <div class="name" style="display:flex;align-items:center;gap:10px;">${clinicAvatarHtml(c, 64)}<span style="flex:1;min-width:0;">${escapeHtml(c.name)}</span></div>
          <div class="count">نسبتك: ${c.commission ?? 70}%${(state.globalClinicCaseCounts && state.globalClinicCaseCounts[c.id] !== undefined) ? ` · ${state.globalClinicCaseCounts[c.id]} حالة` : ''}</div>
          ${soonVisit ? `
            <div class="photo-reminder stock-alert-blink" style="background:#fff8e1;color:#8a6d00;">
              📅 ميعاد العيادة ${soonVisit.daysUntil<=0 ? 'النهاردة أو فات' : `بعد ${soonVisit.daysUntil} يوم`} (${formatDateAr(soonVisit.date)})
            </div>
          ` : ''}
          ${photoDue ? `
            <div class="photo-reminder stock-alert-blink">
              📷 محتاج تصوير الحالات الشهر ده
              <button class="secondary small photo-mark-btn" data-clinic-photo="${c.id}">صورت</button>
            </div>
          ` : `
            <div class="photo-reminder" style="background:transparent;color:var(--muted);padding:2px 0;">
              📷 آخر تصوير: ${c.photoLastMarked || '—'}
            </div>
          `}
          <div class="photo-reminder" style="background:transparent;color:var(--muted);padding:2px 0;">
            📅 ${upcoming.length ? 'الميعاد الجاي: ' + formatDateAr(upcoming[0].date) : 'مفيش ميعاد متسجل'}
          </div>
        </div>
      `;}).join('')}
    </div>
  ` : `<div class="empty-state">لسه مفيش عيادات مضافة. ابدأ بإضافة أول عيادة.</div>`;

  return `
    <header>
      <div class="brand">
        <img src="orenda-logo.png" alt="logo" loading="lazy" decoding="async">
        <div>
          <div style="font-size:13px;color:var(--muted);margin-bottom:2px;">${dashboardGreeting()}،</div>
          <h1 style="display:flex;align-items:center;gap:8px;">
            <span id="doctorNameDisplay">${escapeHtml(state.doctorName || 'MAHMOUD NASSAR')}</span>
            <button class="secondary small" id="editDoctorNameBtn" style="font-size:11px;padding:3px 8px;">تعديل</button>
          </h1>
          <small>Orenda Orthodontic System</small>
        </div>
      </div>
    </header>
    <div class="top-actions">
      <button id="addClinicBtn">+ إضافة عيادة جديدة</button>
      <button class="secondary${(state.inventory||[]).some(i=>(parseFloat(i.qty)||0)<=(parseFloat(i.threshold)||0)) ? ' btn-stock-alert' : ''}" id="openInventoryBtnGlobal">📦 المخزن (كل العيادات)</button>
      <button class="secondary" id="exportBackupBtn">⬇ تصدير نسخة احتياطية</button>
      <button class="secondary" id="importBackupBtn">⬆ استيراد نسخة احتياطية</button>
      <button class="secondary" id="autoBackupsBtn">🕐 النسخ التلقائية</button>
      <input type="file" id="importBackupFile" accept="application/json" style="display:none;">
    </div>

    <div class="section-title" style="margin-top:22px;">🏥 عياداتي</div>
    ${grid}
  `;
}

function attachClinicsHandlers(){
  document.getElementById('addClinicBtn').onclick = () => openClinicModal();
  document.getElementById('editDoctorNameBtn').onclick = () => openEditDoctorNameModal();
  document.getElementById('openInventoryBtnGlobal').onclick = async () => {
    await loadInventory();
    state.view = 'inventory';
    state.inventoryFrom = 'clinics';
    render();
  };
  const openInvFromDashBtn = document.getElementById('openInventoryFromDashBtn');
  if(openInvFromDashBtn) openInvFromDashBtn.onclick = async () => {
    await loadInventory();
    state.view = 'inventory';
    state.inventoryFrom = 'clinics';
    render();
  };
  const financeBreakdownBtn = document.getElementById('openFinanceBreakdownBtn');
  if(financeBreakdownBtn) financeBreakdownBtn.onclick = () => openFinanceBreakdownModal();
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
      existing.photoLastMarked = document.getElementById('clinicFormPhotoDate').value || null;
      existing.visitSchedules = schedules;
      existing.doctorPhoto = newPhoto;
    } else {
      state.clinics.push({ id: clinicIdForPhoto, name, commission, createdAt: todayStr(), photoLastMarked: null, visitSchedules: schedules, doctorPhoto: newPhoto });
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

